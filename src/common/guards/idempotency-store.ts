import type { Knex } from 'knex';
import type { IdempotencyStore, IdempotencyAcquireResult } from './idempotency-store.interface';
import { withTransaction } from '../db/transaction.helper';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

interface IdempotencyKeyRow {
  idempotency_key: string;
  status_code: number | null;
  response_body: string | null;
  created_at: Date;
  completed_at: Date | null;
}

export class DatabaseIdempotencyStore implements IdempotencyStore {
  private readonly db: Knex;
  private readonly ttlMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(db: Knex, ttlMs: number = DEFAULT_TTL_MS) {
    this.db = db;
    this.ttlMs = ttlMs;
    this.startCleanup();
  }

  async tryAcquire(key: string): Promise<IdempotencyAcquireResult> {
    // use withTransaction to ensure transaction timeouts are enforced
    return withTransaction(this.db, async (trx: Knex.Transaction) => {
      const existing = await trx<IdempotencyKeyRow>('idempotency_keys')
        .where({ idempotency_key: key })
        .forUpdate()
        .first();

      if (existing) {
        if (existing.completed_at) {
          let parsedBody: unknown = null;
          try {
            parsedBody = existing.response_body ? JSON.parse(existing.response_body) : null;
          } catch {
            parsedBody = null;
          }
          return {
            status: 'COMPLETED',
            statusCode: existing.status_code ?? 200,
            body: parsedBody,
          };
        }
        return { status: 'IN_FLIGHT' };
      }

      try {
        await trx('idempotency_keys').insert({
          idempotency_key: key,
          created_at: this.db.fn.now(),
        });
      } catch (insertError: unknown) {
        const mysqlErr = insertError as { code?: string };
        if (mysqlErr.code === 'ER_DUP_ENTRY') {
          const record = await trx<IdempotencyKeyRow>('idempotency_keys')
            .where({ idempotency_key: key })
            .forUpdate()
            .first();
          if (record!.completed_at) {
            let parsedBody: unknown = null;
            try {
              parsedBody = record!.response_body ? JSON.parse(record!.response_body) : null;
            } catch {
              parsedBody = null;
            }
            return {
              status: 'COMPLETED',
              statusCode: record!.status_code ?? 200,
              body: parsedBody,
            };
          }
          return { status: 'IN_FLIGHT' };
        }
        throw insertError;
      }

      return { status: 'ACQUIRED' };
    });
  }

  async complete(key: string, statusCode: number, body: unknown): Promise<void> {
    await this.db('idempotency_keys')
      .where({ idempotency_key: key })
      .update({
        status_code: statusCode,
        response_body: JSON.stringify(body),
        completed_at: this.db.fn.now(),
      });
  }

  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        const cutoff = new Date(Date.now() - this.ttlMs);
        await this.db('idempotency_keys')
          .where('created_at', '<', cutoff)
          .delete();
      } catch {
        // Silently handle cleanup errors to avoid unhandled rejections
      }
    }, CLEANUP_INTERVAL_MS);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}
