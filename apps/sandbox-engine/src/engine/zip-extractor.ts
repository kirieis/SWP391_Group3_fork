import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface ExtractedWorkspace {
  targetDir: string;
  files: string[];
  javaFiles: string[];
}

export class ZipSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipSecurityError';
  }
}

export class ZipExtractor {
  /**
   * Safely unpack student zip submission with anti-zip-slip, size, and depth validation.
   */
  public static extract(zipFilePath: string, destinationDir: string): ExtractedWorkspace {
    if (!fs.existsSync(zipFilePath)) {
      throw new ZipSecurityError(`Submission zip file does not exist: ${zipFilePath}`);
    }

    const stats = fs.statSync(zipFilePath);
    if (stats.size > config.MAX_ZIP_SIZE_BYTES) {
      throw new ZipSecurityError(
        `Zip file size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds limit of ${config.MAX_ZIP_SIZE_BYTES / 1024 / 1024}MB`
      );
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipFilePath);
    } catch (err: any) {
      throw new ZipSecurityError(`Corrupted or invalid zip file: ${err.message}`);
    }

    const entries = zip.getEntries();
    if (entries.length > config.MAX_ZIP_FILES) {
      throw new ZipSecurityError(
        `Zip file contains too many entries (${entries.length}), max allowed is ${config.MAX_ZIP_FILES}`
      );
    }

    let totalUncompressedBytes = 0;
    const resolvedDestDir = path.resolve(destinationDir);

    // First pass: Pre-validation of all entries
    for (const entry of entries) {
      totalUncompressedBytes += entry.header.size;
      if (totalUncompressedBytes > config.MAX_UNCOMPRESSED_SIZE_BYTES) {
        throw new ZipSecurityError(
          `Uncompressed size exceeds limit of ${config.MAX_UNCOMPRESSED_SIZE_BYTES / 1024 / 1024}MB (Possible Zip Bomb)`
        );
      }

      // Check directory depth
      const depth = entry.entryName.split(/[\/\\]/).filter(Boolean).length;
      if (depth > config.MAX_DIR_DEPTH) {
        throw new ZipSecurityError(
          `Directory nesting depth (${depth}) exceeds limit of ${config.MAX_DIR_DEPTH}`
        );
      }

      // Zip Slip detection
      const targetFilePath = path.resolve(resolvedDestDir, entry.entryName);
      if (!targetFilePath.startsWith(resolvedDestDir + path.sep) && targetFilePath !== resolvedDestDir) {
        throw new ZipSecurityError(
          `Zip-Slip path traversal attack detected in entry: ${entry.entryName}`
        );
      }

      // Block executable / script injection
      const ext = path.extname(entry.entryName).toLowerCase();
      const dangerousExtensions = ['.sh', '.bash', '.exe', '.bat', '.cmd', '.dll', '.so', '.bin'];
      if (dangerousExtensions.includes(ext)) {
        throw new ZipSecurityError(`Dangerous executable file extension detected: ${entry.entryName}`);
      }
    }

    // Second pass: Safe extraction
    if (!fs.existsSync(resolvedDestDir)) {
      fs.mkdirSync(resolvedDestDir, { recursive: true });
    }

    const extractedFiles: string[] = [];
    const javaFiles: string[] = [];

    for (const entry of entries) {
      const targetFilePath = path.resolve(resolvedDestDir, entry.entryName);

      if (entry.isDirectory) {
        if (!fs.existsSync(targetFilePath)) {
          fs.mkdirSync(targetFilePath, { recursive: true });
        }
      } else {
        const parentDir = path.dirname(targetFilePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.writeFileSync(targetFilePath, entry.getData());
        extractedFiles.push(targetFilePath);

        if (targetFilePath.endsWith('.java')) {
          javaFiles.push(targetFilePath);
        }
      }
    }

    return {
      targetDir: resolvedDestDir,
      files: extractedFiles,
      javaFiles
    };
  }
}
