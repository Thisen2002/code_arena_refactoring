import { z } from 'zod';
export const reportInput = z.object({
  kind: z.enum(['hazard', 'help']),
  helpCategory: z.enum(['rescue', 'medical', 'food', 'water', 'shelter', 'other']).optional(),
  description: z.string().trim().min(10).max(2000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  locationSource: z.enum(['manual', 'device']),
  gpsAccuracy: z.number().min(0).max(100000).optional(),
  submissionKey: z.uuid(),
}).strict().superRefine((value, context) => {
  if (value.kind === 'help' && !value.helpCategory) context.addIssue({ code: 'custom', path: ['helpCategory'], message: 'Choose the help needed.' });
  if (value.kind === 'hazard' && value.helpCategory) context.addIssue({ code: 'custom', path: ['helpCategory'], message: 'Help category is only valid for help requests.' });
  if (value.locationSource === 'manual' && value.gpsAccuracy !== undefined) context.addIssue({ code: 'custom', path: ['gpsAccuracy'], message: 'Manual coordinates have no measured device accuracy.' });
});
export const listInput = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).default(50),
  offset: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(100000)).default(0),
  kind: z.enum(['hazard', 'help']).optional(),
  statusGroup: z.enum(['resolved', 'active']).optional(),
}).strict();
