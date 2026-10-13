import path from 'path';
import { executionService } from './engine/execution.service';
import { logger } from './utils/logger';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
Usage:
  npm run cli -- <path-to-zip-file> [language]

Example:
  npm run cli -- ./submissions/test_student.zip Java
    `);
    process.exit(1);
  }

  const zipPath = path.resolve(process.cwd(), args[0]);
  const language = args[1] || 'Java';
  const submissionId = `cli_test_${Date.now()}`;

  console.log(`Running CLI test with: ${zipPath} (Language: ${language})`);

  const result = await executionService.executeSubmission({
    submissionId,
    zipFilePath: zipPath,
    language
  });

  console.log('\n--- Execution Result ---');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  logger.error({ err }, 'CLI Execution failed');
  process.exit(1);
});
