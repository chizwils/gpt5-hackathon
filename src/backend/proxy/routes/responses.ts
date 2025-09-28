import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { responsesRequestSchema, responsesReplySchema } from '../types';
import { getOpenAIClient } from '../openai-client';

const streamHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive'
} as const;

const buildMetadata = (context?: {
  pageIds?: string[];
  textSnippets?: string[];
  highlights?: string[];
}) => {
  const metadata: Record<string, string> = { source: 'semantic-memory' };
  if (!context) return metadata;

  if (context.pageIds?.length) {
    metadata.pageIds = context.pageIds.slice(0, 5).join(',');
  }

  const normalise = (value: string) => value.replace(/\s+/g, ' ').slice(0, 120);

  if (context.textSnippets?.length) {
    metadata.snippets = context.textSnippets.slice(0, 3).map(normalise).join(' | ');
  }

  if (context.highlights?.length) {
    metadata.highlights = context.highlights.slice(0, 3).map(normalise).join(' | ');
  }

  return metadata;
};

const extractResponseText = (response: unknown): string => {
  if (!response || typeof response !== 'object') return '';
  const record = response as Record<string, unknown>;

  if (typeof record.output_text === 'string') {
    return record.output_text.trim();
  }

  const output = record.output as Array<{ content?: Array<{ text?: { value?: string } }> }> | undefined;
  if (!Array.isArray(output)) return '';

  return output
    .flatMap((item) => {
      const content = item.content;
      if (!Array.isArray(content)) return [] as string[];
      return content.map((entry) => entry.text?.value ?? '').filter(Boolean);
    })
    .join('\n')
    .trim();
};

const sendStreamResponse = (
  reply: FastifyReply,
  chunks: Array<{ delta?: string; tokensEstimated?: number }>
) => {
  reply.hijack();
  reply.raw.writeHead(200, streamHeaders);
  for (const chunk of chunks) {
    reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  reply.raw.write('data: [DONE]\n\n');
  reply.raw.end();
};

export const responsesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/responses', async (request, reply) => {
    const body = responsesRequestSchema.parse(request.body ?? {});

    if (body.stream) {
      const client = getOpenAIClient();
      if (!client) {
        sendStreamResponse(reply, [
          { delta: `Mock GPT-5 response. Prompt preview: ${body.prompt.slice(0, 120)}` },
          { tokensEstimated: Math.ceil(body.prompt.split(/\s+/).length * 1.2) }
        ]);
        return;
      }

      try {
        const response = await client.responses.create({
          model: 'gpt-5-mini',
          input: body.prompt,
          temperature: body.temperature,
          metadata: buildMetadata(body.context)
        });

        const text = extractResponseText(response);
        sendStreamResponse(reply, [
          { delta: text },
          { tokensEstimated: response.usage?.total_tokens }
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sendStreamResponse(reply, [{ delta: `Error: ${message}` }]);
      }
      return;
    }

    const client = getOpenAIClient();
    if (!client) {
      const fallback = responsesReplySchema.parse({
        id: `mock-res-${Date.now()}`,
        createdAt: new Date().toISOString(),
        text: `Mock GPT-5 response. Prompt preview: ${body.prompt.slice(0, 120)}`,
        tokensEstimated: Math.ceil(body.prompt.split(/\s+/).length * 1.2)
      });
      await reply.status(200).send(fallback);
      return;
    }

    try {
      const gptResponse = await client.responses.create({
        model: 'gpt-5-mini',
        input: body.prompt,
        temperature: body.temperature,
        metadata: buildMetadata(body.context)
      });

      const text = extractResponseText(gptResponse);
      const payload = responsesReplySchema.parse({
        id: gptResponse.id,
        createdAt: new Date().toISOString(),
        text: text || 'GPT-5 returned no text output.',
        tokensEstimated: gptResponse.usage?.total_tokens
      });

      await reply.status(200).send(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error({ err: error, promptLength: body.prompt.length }, 'GPT-5 Responses API failed');
      await reply.status(502).send({
        error: 'gpt5_responses_failed',
        message
      });
    }
  });
};
