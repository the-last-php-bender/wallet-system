import type { Knex } from 'knex';
import { ErrorLogger } from '../filters/error.middleware';
import { LogLevel } from '../enums';

export async function withTransaction<T>(db: Knex, fn: (trx: Knex.Transaction) => Promise<T>, timeoutMs: number = 30000): Promise<T> {
  // Some test mocks stub db.transaction to return a trx when called without a callback.
  // Support both patterns:
  // 1) db.transaction(async (trx) => { ... }) - preferred for real Knex
  // 2) const trx = await db.transaction(); await fn(trx); await trx.commit(); - used by some unit tests
  const rawTransaction = (db as any).transaction;

  if (typeof rawTransaction === 'function' && rawTransaction.length === 0) {
    // Mock-style: call without callback to obtain a trx object
    const trx: Knex.Transaction = await (db as any).transaction();
    const timeoutId = setTimeout(() => {
      try {
        ErrorLogger.log(LogLevel.WARN, 'Transaction timeout reached - attempting rollback', new Error('transaction_timeout'));
        (trx as any).rollback(new Error('Transaction timed out'));
      } catch (_) {
        // ignore
      }
    }, timeoutMs);

    try {
      const result = await fn(trx);
      clearTimeout(timeoutId);
      if (typeof (trx as any).commit === 'function') {
        await (trx as any).commit();
      }
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      try {
        if (typeof (trx as any).rollback === 'function') {
          await (trx as any).rollback(error);
        }
      } catch (_) {
        // ignore rollback errors
      }
      throw error;
    }
  }

  // Default: pass callback to knex.transaction
  return db.transaction(async (trx: Knex.Transaction) => {
    const timeoutId = setTimeout(() => {
      try {
        ErrorLogger.log(LogLevel.WARN, 'Transaction timeout reached - attempting rollback', new Error('transaction_timeout'));
        (trx as any).rollback(new Error('Transaction timed out'));
      } catch (err) {
      }
    }, timeoutMs);

    try {
      const result = await fn(trx);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  });
}
