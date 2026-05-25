import type { Knex } from 'knex';
import { ErrorLogger } from '../filters/error.middleware';
import { LogLevel } from '../enums';

export async function withTransaction<T>(db: Knex, fn: (trx: Knex.Transaction) => Promise<T>, timeoutMs: number = 30000): Promise<T> {
  // Some test mocks stub db.transaction to return a trx when called without a callback.
  // Support both patterns:
  // 1) db.transaction(async (trx) => { ... }) - preferred for real Knex
  // 2) const trx = await db.transaction(); await fn(trx); await trx.commit(); - used by some unit tests
  const dbObj = db as unknown as Record<string, unknown>;
  const rawTransaction = dbObj.transaction;

  if (typeof rawTransaction === 'function' && rawTransaction.length === 0) {
    // Mock-style: call without callback to obtain a trx object
    const trx = await (db as unknown as { transaction: () => Promise<Knex.Transaction> }).transaction();
    const trxObj = trx as unknown as Record<string, unknown>;
    const timeoutId = setTimeout(() => {
      try {
        ErrorLogger.log(LogLevel.WARN, 'Transaction timeout reached - attempting rollback', new Error('transaction_timeout'));
        if (typeof trxObj.rollback === 'function') {
          (trxObj.rollback as (err?: Error) => Promise<void>)(new Error('Transaction timed out'));
        }
      } catch {
        // ignore
      }
    }, timeoutMs);

    try {
      const result = await fn(trx);
      clearTimeout(timeoutId);
      if (typeof trxObj.commit === 'function') {
        await (trxObj.commit as () => Promise<void>)();
      }
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      try {
        if (typeof trxObj.rollback === 'function') {
          await (trxObj.rollback as (err?: Error) => Promise<void>)(error as Error);
        }
      } catch {
        // ignore rollback errors
      }
      throw error;
    }
  }

  // Default: pass callback to knex.transaction
  return db.transaction(async (trx: Knex.Transaction) => {
    const trxObj = trx as unknown as Record<string, unknown>;
    const timeoutId = setTimeout(() => {
      try {
        ErrorLogger.log(LogLevel.WARN, 'Transaction timeout reached - attempting rollback', new Error('transaction_timeout'));
        if (typeof trxObj.rollback === 'function') {
          (trxObj.rollback as (err?: Error) => Promise<void>)(new Error('Transaction timed out'));
        }
       } catch {
         // Intentionally ignore timeout callback errors
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
