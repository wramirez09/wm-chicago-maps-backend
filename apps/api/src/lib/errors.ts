import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { UpstreamError } from './http.js';

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}
export const notFound = (what = 'Not found') => new HttpError(404, what);
export const unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg);
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);
export const badRequest = (msg: string) => new HttpError(400, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

export function registerErrorHandler(app: Pick<FastifyInstance, 'setErrorHandler'>) {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ statusCode: err.statusCode, error: err.name, message: err.message });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.validation.map((v) => `${v.instancePath || v.params?.issue?.path?.join('.') || 'body'} ${v.message}`).join('; '),
      });
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err }, 'response failed schema');
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Response did not match schema' });
    }
    if (err instanceof UpstreamError) {
      req.log.warn({ err }, 'upstream failure');
      return reply.status(502).send({ statusCode: 502, error: 'Bad Gateway', message: `${err.service} unavailable` });
    }
    const status = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'unhandled');
    return reply.status(status).send({ statusCode: status, error: status >= 500 ? 'Internal Server Error' : err.name, message: status >= 500 ? 'Something went wrong' : err.message });
  });
}
