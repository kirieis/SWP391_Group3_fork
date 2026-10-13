import { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { executionService } from '../../engine/execution.service';
import { logger } from '../../utils/logger';

export const ExecuteRequestSchema = z.object({
  submissionId: z.string().min(1, 'submissionId is required'),
  assignmentId: z.string().optional(),
  language: z.string().default('Java'),
  fileRelativePath: z.string().optional(),
  zipFilePath: z.string().optional(),
  testCases: z
    .array(
      z.object({
        id: z.string().optional(),
        inputData: z.string().optional().default(''),
        expectedOutput: z.string().optional().default(''),
        scoreWeight: z.number().optional().default(1)
      })
    )
    .optional()
});

export async function executeController(req: Request, res: Response): Promise<Response> {
  const token = req.headers['x-internal-key'] || req.headers['authorization'];
  if (token && token !== config.INTERNAL_TOKEN && token !== config.CORE_API_KEY) {
    logger.warn({ token }, 'Unauthorized request to /execute rejected');
    return res.status(403).json({ error: 'Unauthorized: Invalid internal token' });
  }

  const parseResult = ExecuteRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten()
    });
  }

  try {
    const result = await executionService.executeSubmission(parseResult.data);
    return res.status(200).json(result);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to execute job in controller');
    return res.status(500).json({
      outcome: 'COMPILATION_ERROR',
      passedTests: 0,
      totalTests: 0,
      executionTimeMs: 0,
      errorMessage: err.message
    });
  }
}
