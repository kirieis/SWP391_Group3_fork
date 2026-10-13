import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { dockerRunner } from '../../src/engine/docker-runner';
import { executionService } from '../../src/engine/execution.service';

interface AttackScenario {
  name: string;
  sourceFile: string;
  expectedOutcome: string;
  description: string;
}

const scenarios: AttackScenario[] = [
  {
    name: 'P2P-01: Fork Bomb / Process Overflow',
    sourceFile: 'ForkBomb.java',
    expectedOutcome: 'SECURITY_VIOLATION',
    description: 'Chống đẻ luồng/tiến trình vô hạn bằng --pids-limit=64'
  },
  {
    name: 'P2P-02: Infinite CPU Loop / Hang',
    sourceFile: 'InfiniteLoop.java',
    expectedOutcome: 'TIMEOUT',
    description: 'Kill container sau 5s per-testcase hoặc 30s overall'
  },
  {
    name: 'P2P-03: Memory Exhaustion / OOM Bomb',
    sourceFile: 'MemoryBomb.java',
    expectedOutcome: 'SECURITY_VIOLATION',
    description: 'Chống tràn RAM, giới hạn 512MB RAM không cấp thêm swap'
  },
  {
    name: 'P2P-04: Host Filesystem Escape',
    sourceFile: 'HostEscape.java',
    expectedOutcome: 'SECURITY_VIOLATION',
    description: 'Chống đọc /etc/shadow hoặc ghi đè root nhờ ReadonlyRootfs & CapDrop'
  },
  {
    name: 'BENCHMARK: Normal Student Submission',
    sourceFile: 'SafeStudent.java',
    expectedOutcome: 'PASSED',
    description: 'Bài nộp tiêu chuẩn của sinh viên chạy thành công'
  }
];

async function main() {
  console.log('=================================================================');
  console.log('🛡️  AITA-INTELLIGENT: P2P SECURITY & ATTACK VERIFICATION SUITE');
  console.log('=================================================================\n');

  const isDockerAlive = await dockerRunner.ping();
  if (!isDockerAlive) {
    console.log('⚠️  DOCKER DAEMON IS NOT RUNNING ON THIS HOST.');
    console.log('Để chạy bài kiểm tra container thật, hãy đảm bảo Docker daemon đã bật:');
    console.log('   sudo systemctl start docker');
    console.log('   npm run docker:build:java17\n');
    console.log('Sau đó chạy lại lệnh: npm run attack-test');
    process.exit(0);
  }

  const fixturesDir = path.resolve(__dirname, 'fixtures');
  const tempDir = path.resolve(__dirname, '../../tmp/attacks');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  console.log('Bắt đầu thử thách tấn công P2P Sandbox:\n');
  let passedCount = 0;

  for (const sc of scenarios) {
    const srcPath = path.join(fixturesDir, sc.sourceFile);
    if (!fs.existsSync(srcPath)) {
      console.error(`Missing fixture: ${srcPath}`);
      continue;
    }

    // Package fixture into a zip
    const zip = new AdmZip();
    zip.addLocalFile(srcPath, '', 'Main.java');
    const zipPath = path.join(tempDir, `${sc.sourceFile}.zip`);
    zip.writeZip(zipPath);

    const submissionId = `p2p_attack_${Date.now()}_${sc.sourceFile.replace('.java', '')}`;

    console.log(`[TESTING] ${sc.name}`);
    console.log(`  Mô tả: ${sc.description}`);

    const result = await executionService.executeSubmission({
      submissionId,
      zipFilePath: zipPath,
      language: 'Java',
      testCases: [
        {
          id: 'tc-attack',
          inputData: 'Hello\n',
          expectedOutput: 'Echo: Hello',
          scoreWeight: 10
        }
      ]
    });

    const isMatch = result.outcome === sc.expectedOutcome;
    if (isMatch) {
      passedCount++;
      console.log(`  ✅ KẾT QUẢ: ĐẠT! Outcome = ${result.outcome} (${result.executionTimeMs}ms)\n`);
    } else {
      console.log(`  ❌ KẾT QUẢ: CHƯA ĐẠT. Thực tế: ${result.outcome} | Kỳ vọng: ${sc.expectedOutcome}`);
      if (result.errorMessage) {
        console.log(`     Chi tiết lỗi: ${result.errorMessage}`);
      }
      console.log();
    }
  }

  // Cleanup temp zip files
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log('=================================================================');
  console.log(`📊 TỔNG KẾT P2P DEFENSE: ${passedCount}/${scenarios.length} KỊCH BẢN VƯỢT QUA`);
  console.log('=================================================================');
}

main().catch((err) => {
  console.error('Fatal attack test error:', err);
  process.exit(1);
});
