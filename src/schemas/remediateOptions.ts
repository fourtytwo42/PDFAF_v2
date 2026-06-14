import { z } from 'zod';

export const remediateOptionsSchema = z
  .object({
    semantic: z.boolean().optional(),
    semanticHeadings: z.boolean().optional(),
    semanticPromoteHeadings: z.boolean().optional(),
    semanticUntaggedHeadings: z.boolean().optional(),
    semanticTimeoutMs: z.number().int().positive().max(600_000).optional(),
    semanticHeadingTimeoutMs: z.number().int().positive().max(600_000).optional(),
    semanticPromoteHeadingTimeoutMs: z.number().int().positive().max(600_000).optional(),
    semanticUntaggedHeadingTimeoutMs: z.number().int().positive().max(600_000).optional(),
    readabilityReview: z.boolean().optional(),
    readabilityReviewTimeoutMs: z.number().int().positive().max(600_000).optional(),
    readabilityAutoRepair: z.boolean().optional(),
    readabilityAutoRepairMaxAttempts: z.number().int().min(0).max(10).optional(),
    readabilityAutoRepairTimeoutMs: z.number().int().min(0).max(600_000).optional(),
    targetScore: z.number().min(0).max(100).optional(),
    maxRounds: z.number().int().min(1).max(10).optional(),
    includeOptionalRemediation: z.boolean().optional(),
    htmlReport: z.boolean().optional(),
    htmlReportIncludeBeforeAfter: z.boolean().optional(),
    htmlReportIncludeFindingsDetail: z.boolean().optional(),
    htmlReportIncludeAppliedTools: z.boolean().optional(),
  })
  .strict();

export type ParsedRemediateOptions = z.infer<typeof remediateOptionsSchema>;
