import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { IdempotencyStore } from './idempotency-store.interface';
import { DatabaseIdempotencyStore } from './idempotency-store';
import db from '../../../config/database';
import { HttpStatus, ErrorCode } from '../enums';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

export function createIdempotencyMiddleware(store?: IdempotencyStore): RequestHandler {
  const idempotencyStore = store ?? new DatabaseIdempotencyStore(db);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const key = req.headers['x-idempotency-key'] as string | undefined;
    if (!key) {
      next();
      return;
    }

    try {
      const result = await idempotencyStore.tryAcquire(key);

      if (result.status === 'COMPLETED') {
        res.status(result.statusCode).json(result.body);
        return;
      }

      if (result.status === 'IN_FLIGHT') {
        res.status(HttpStatus.CONFLICT).json({
          status: 'error',
          code: ErrorCode.IDEMPOTENCY_IN_FLIGHT,
          message: 'A request with this idempotency key is already being processed. Wait for completion or use a new key.',
        });
        return;
      }

      res.locals.idempotencyKey = key;

      res.once('finish', () => {
        const body = res.locals.idempotencyCachedBody;
        if (body !== undefined) {
          idempotencyStore.complete(key, res.statusCode, body)
            .catch(() => {});
        }
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const idempotencyMiddleware = createIdempotencyMiddleware();
