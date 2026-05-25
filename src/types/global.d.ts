declare global {
  namespace Express {
    interface Locals {
      idempotencyKey?: string;
      idempotencyCachedBody?: unknown;
    }
  }
}

export {};
