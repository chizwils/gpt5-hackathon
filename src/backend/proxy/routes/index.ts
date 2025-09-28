import type { FastifyPluginAsync } from 'fastify';
import { responsesRoute } from './responses';
import { fileIndexRoute } from './file-index';

export const registerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(responsesRoute);
  fastify.register(fileIndexRoute);
};
