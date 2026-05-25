export type IdempotencyAcquireResult =
  | { status: 'COMPLETED'; statusCode: number; body: unknown }
  | { status: 'IN_FLIGHT' }
  | { status: 'ACQUIRED' };

export interface IdempotencyStore {
  tryAcquire(key: string): Promise<IdempotencyAcquireResult>;
  complete(key: string, statusCode: number, body: unknown): Promise<void>;
}
