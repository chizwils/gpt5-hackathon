import type { FastifyPluginAsync } from 'fastify';
import { fileIndexRequestSchema } from '../types';

export const fileIndexRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/file-search/index', async (request, reply) => {
    const body = fileIndexRequestSchema.parse(request.body ?? {});

    if (!process.env.AI_API_KEY) {
      await reply.status(202).send({
        accepted: body.items.length,
        strategy: body.strategy,
        message: 'Mock index accepted. Provide OPENAI_API_KEY for live indexing.'
      });
      return;
    }

    // TODO: integrate with GPT-5 File Search once available in SDK.
    await reply.status(202).send({
      accepted: body.items.length,
      strategy: body.strategy,
      message: 'Live indexing not yet implemented; TODO wire to GPT-5 File Search.'
    });
  });
};
