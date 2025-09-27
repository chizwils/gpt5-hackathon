import { z } from 'zod';

export const responsesRequestSchema = z.object({
  prompt: z.string().min(1),
  context: z
    .object({
      pageIds: z.array(z.string()).default([]),
      textSnippets: z.array(z.string()).default([]),
      highlights: z.array(z.string()).default([]),
      metadata: z.record(z.any()).optional()
    })
    .optional(),
  stream: z.boolean().default(false),
  temperature: z.number().min(0).max(1).default(0.2)
});

export const responsesReplySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  text: z.string(),
  tokensEstimated: z.number().optional()
});

export type ResponsesRequestBody = z.infer<typeof responsesRequestSchema>;
export type ResponsesReplyBody = z.infer<typeof responsesReplySchema>;

export const fileIndexRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        pageId: z.string(),
        chunk: z.string(),
        embedding: z.array(z.number()).optional()
      })
    )
    .min(1),
  strategy: z.enum(['openai', 'local']).default('openai')
});

export type FileIndexRequestBody = z.infer<typeof fileIndexRequestSchema>;
