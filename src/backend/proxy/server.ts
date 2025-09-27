import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { responsesRequestSchema, responsesReplySchema, fileIndexRequestSchema } from './types';

const buildServer = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  app.post('/responses', async (request, reply) => {
    const body = responsesRequestSchema.parse(request.body ?? {});

    const preview = body.prompt.length > 120 ? `${body.prompt.slice(0, 117)}...` : body.prompt;

    const response = responsesReplySchema.parse({
      id: `mock-res-${Date.now()}`,
      createdAt: new Date().toISOString(),
      text: `Mock GPT-5 response based on: "${preview}". Connect real GPT-5 Responses API here.`,
      tokensEstimated: Math.ceil(preview.split(/\s+/).length * 1.3)
    });

    await reply.status(200).send(response);
  });

  app.post('/file-search/index', async (request, reply) => {
    const body = fileIndexRequestSchema.parse(request.body ?? {});
    await reply.status(202).send({
      accepted: body.items.length,
      strategy: body.strategy,
      message: 'Mock index accepted. Wire to GPT-5 File Search uploads.'
    });
  });

  return app;
};

const start = async () => {
  const port = Number(process.env.GPT5_PROXY_PORT ?? 8788);
  const host = process.env.GPT5_PROXY_HOST ?? '0.0.0.0';
  const server = buildServer();

  try {
    await server.listen({ port, host });
    console.info(`GPT-5 proxy listening on http://${host}:${port}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}

export { buildServer };
