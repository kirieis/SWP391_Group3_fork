import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';
import tar from 'tar-stream';
import { Readable, PassThrough } from 'stream';
import { config } from '../config';
import { logger } from '../utils/logger';
import { truncateOutput } from '../security/sanitize';

export interface ContainerExecOptions {
  cmd: string[];
  stdin?: string;
  timeoutSec?: number;
  workdir?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  oomKilled: boolean;
  durationMs: number;
}

export interface SandboxContainer {
  id: string;
  putDirectory(sourceDir: string, destPath?: string): Promise<void>;
  exec(options: ContainerExecOptions): Promise<ExecResult>;
  destroy(): Promise<void>;
  inspect(): Promise<Docker.ContainerInspectInfo | null>;
}

export class DockerRunner {
  private docker: Docker;

  constructor(customDocker?: Docker) {
    this.docker = customDocker || new Docker();
  }

  /**
   * Check if Docker daemon is responsive.
   */
  public async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Spawn a strictly isolated, hardened Docker container adhering to NFR-01 and NFR-02.
   */
  public async createSandboxContainer(submissionId: string, image = config.JAVA_IMAGE): Promise<SandboxContainer> {
    const memoryBytes = config.SANDBOX_MEMORY_MB * 1024 * 1024;
    const nanoCpus = Math.floor(config.SANDBOX_CPUS * 1_000_000_000);

    logger.info({ submissionId, image }, 'Creating hardened sandbox container');

    const container = await this.docker.createContainer({
      Image: image,
      Cmd: ['/bin/bash'],
      Tty: false,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      User: '10001:10001',
      WorkingDir: '/workspace',
      Labels: {
        'aita.sandbox': 'true',
        'aita.submissionId': submissionId,
        'aita.createdAt': new Date().toISOString()
      },
      HostConfig: {
        // NFR-01: Resource Limits
        Memory: memoryBytes,
        MemorySwap: memoryBytes, // Disable swap to prevent RAM overflow
        NanoCpus: nanoCpus,
        NetworkMode: 'none', // 100% disconnected from external network

        // NFR-02: Security Hardening
        PidsLimit: config.SANDBOX_PIDS_LIMIT, // Choke Fork Bombs
        ReadonlyRootfs: true, // Immutable root filesystem
        Tmpfs: {
          '/tmp': `rw,noexec,nosuid,size=${config.SANDBOX_TMPFS_SIZE_MB}m`,
          '/workspace': 'rw,exec,nosuid,size=128m'
        },
        CapDrop: ['ALL'], // Drop all Linux capabilities
        SecurityOpt: ['no-new-privileges:true'],

        // Auto clean up configuration
        AutoRemove: false // Controlled cleanup in finally block (NFR-14)
      }
    });

    await container.start();
    const containerId = container.id;

    return {
      id: containerId,

      putDirectory: async (sourceDir: string, destPath = '/workspace'): Promise<void> => {
        const pack = tar.pack();

        const addFilesRecursively = (currentDir: string, baseDir: string) => {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

            if (entry.isDirectory()) {
              addFilesRecursively(fullPath, baseDir);
            } else if (entry.isFile()) {
              const fileContent = fs.readFileSync(fullPath);
              pack.entry({ name: relPath, mode: 0o644 }, fileContent);
            }
          }
        };

        addFilesRecursively(sourceDir, sourceDir);
        pack.finalize();

        await container.putArchive(pack as any, { path: destPath });
      },

      exec: async (options: ContainerExecOptions): Promise<ExecResult> => {
        const startTime = Date.now();
        const timeoutMs = (options.timeoutSec || config.TEST_CASE_TIMEOUT_SEC) * 1000;

        const execInstance = await container.exec({
          Cmd: options.cmd,
          AttachStdin: !!options.stdin,
          AttachStdout: true,
          AttachStderr: true,
          WorkingDir: options.workdir || '/workspace',
          User: '10001:10001'
        });

        const stream = await execInstance.start({
          hijack: true,
          stdin: !!options.stdin
        });

        let stdoutData = '';
        let stderrData = '';
        let timedOut = false;
        let oomKilled = false;

        const stdoutPass = new PassThrough();
        const stderrPass = new PassThrough();

        stdoutPass.on('data', (chunk: Buffer) => {
          stdoutData += chunk.toString('utf-8');
        });

        stderrPass.on('data', (chunk: Buffer) => {
          stderrData += chunk.toString('utf-8');
        });

        // Demux stdout and stderr streams from Docker multiplexed stream
        this.docker.modem.demuxStream(stream, stdoutPass, stderrPass);

        if (options.stdin) {
          stream.write(options.stdin);
          if (!options.stdin.endsWith('\n')) {
            stream.write('\n');
          }
          stream.end();
        }

        const waitPromise = new Promise<{ exitCode: number }>((resolve) => {
          stream.on('end', async () => {
            try {
              const inspectData = await execInstance.inspect();
              resolve({ exitCode: inspectData.ExitCode ?? 0 });
            } catch {
              resolve({ exitCode: 0 });
            }
          });
        });

        let timer: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<{ exitCode: number }>((resolve) => {
          timer = setTimeout(async () => {
            timedOut = true;
            try {
              // Kill container if process hung
              await container.kill().catch(() => {});
            } catch {
              // Ignore
            }
            resolve({ exitCode: 124 }); // 124 is standard timeout exit code
          }, timeoutMs);
        });

        const { exitCode } = await Promise.race([waitPromise, timeoutPromise]);
        if (timer) clearTimeout(timer);

        const durationMs = Date.now() - startTime;

        // Inspect container to check if it was killed by OOM
        try {
          const inspectInfo = await container.inspect();
          if (inspectInfo.State.OOMKilled) {
            oomKilled = true;
          }
        } catch {
          // Container might be already stopped
        }

        return {
          exitCode,
          stdout: truncateOutput(stdoutData).content,
          stderr: truncateOutput(stderrData).content,
          timedOut,
          oomKilled,
          durationMs
        };
      },

      destroy: async (): Promise<void> => {
        try {
          await container.remove({ force: true });
          logger.info({ containerId }, 'Container explicitly removed (NFR-14)');
        } catch (err: any) {
          logger.warn({ err: err.message, containerId }, 'Warning: failed to remove container');
        }
      },

      inspect: async (): Promise<Docker.ContainerInspectInfo | null> => {
        try {
          return await container.inspect();
        } catch {
          return null;
        }
      }
    };
  }
}

export const dockerRunner = new DockerRunner();
