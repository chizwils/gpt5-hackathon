import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import { registerRoutes } from './routes';

const buildServer = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: true });

  await app.register(fastifyCors, {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', /chrome-extension:\/\/.*/],
    methods: ['POST', 'GET', 'OPTIONS']
  });

  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));
  await app.register(registerRoutes);

  return app;
};

const start = async () => {
  const port = Number(process.env.GPT5_PROXY_PORT ?? 8788);
  const host = process.env.GPT5_PROXY_HOST ?? '0.0.0.0';
  const server = await buildServer();

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
