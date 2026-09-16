import { z } from 'zod';
import { PlaceSubmission } from './places.js';

export const SubmissionStatus = z.enum(['pending', 'approved', 'rejected']);
export const QueueItem = z.object({
  id: z.string().uuid(),
  submittedBy: z.string().uuid(),
  submittedAt: z.string(),
  status: SubmissionStatus,
  autochecks: z.object({
    duplicateOf: z.string().uuid().nullable(),
    insideChicago: z.boolean(),
    licenseMatch: z.string().nullable(),
  }).nullable(),
  submission: PlaceSubmission,
});
export const Queue = z.object({ items: z.array(QueueItem), total: z.number().int() });
export const QueueQuery = z.object({
  status: SubmissionStatus.default('pending'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const ModDecision = z.object({ reason: z.string().max(500).optional() });
export const ModResult = z.object({ submissionId: z.string().uuid(), status: SubmissionStatus, placeId: z.string().uuid().nullable() });
