import type { Knex } from 'knex';
import { LedgerEntryType, SortOrder } from '../../common/enums';
import { RepositoryException } from '../../common/exceptions/repository.exception';
import { parseBalance, normalizeBalance } from '../../common/utils/money';
import { idGenerator } from '../../common/utils/id-generator';

export interface CreateLedgerEntryParams {
  walletId: string;
  amount: string;
  type: LedgerEntryType;
  description: string;
}

export interface LedgerEntryRecord {
  id: string;
  wallet_id: string;
  amount: string;
  type: LedgerEntryType;
  description: string;
  created_at: Date;
}

function normalizeLedgerEntryRecord(entry: LedgerEntryRecord): LedgerEntryRecord {
  return {
    ...entry,
    amount: normalizeBalance(entry.amount),
  };
}

export class LedgerRepository {
  public async createEntry(
    params: CreateLedgerEntryParams,
    trx: Knex.Transaction
  ): Promise<LedgerEntryRecord> {
    const { walletId, amount, type, description } = params;

    if (typeof walletId !== 'string' || walletId.trim().length === 0) {
      throw new RepositoryException(
        'Invalid wallet identifier for ledger entry.',
        `walletId=${walletId} is not a valid identifier.`
      );
    }

    let validatedAmount: bigint;
    try {
      validatedAmount = parseBalance(amount);
    } catch {
      throw new RepositoryException(
        'Invalid amount format for ledger entry.',
        `amount=${amount} could not be parsed as a valid integer.`
      );
    }

    if (validatedAmount <= 0n) {
      throw new RepositoryException(
        'Invalid amount for ledger entry.',
        `amount=${amount} must be a positive integer.`
      );
    }

    if (type !== LedgerEntryType.DEBIT && type !== LedgerEntryType.CREDIT) {
      throw new RepositoryException(
        'Invalid ledger entry type.',
        `type=${type} is not DEBIT or CREDIT.`
      );
    }

    const trimmedDescription = description?.trim() ?? '';
    if (trimmedDescription.length === 0 || trimmedDescription.length > 255) {
      throw new RepositoryException(
        'Invalid description for ledger entry.',
        `description length=${trimmedDescription.length} out of range.`
      );
    }

    const normalizedAmount = validatedAmount.toString();
    const entryId = idGenerator.generate();
    const now = new Date();

    await trx<LedgerEntryRecord>('ledger_entries').insert({
      id: entryId,
      wallet_id: walletId,
      amount: normalizedAmount,
      type: type,
      description: trimmedDescription,
      created_at: now,
    });

    return {
      id: entryId,
      wallet_id: walletId,
      amount: normalizedAmount,
      type: type,
      description: trimmedDescription,
      created_at: now,
    };
  }

  public async sumByWalletId(walletId: string, trx: Knex.Transaction): Promise<string> {
    if (typeof walletId !== 'string' || walletId.trim().length === 0) {
      throw new RepositoryException(
        'Invalid wallet identifier for balance sum.',
        `walletId=${walletId} is not a valid identifier.`
      );
    }

    const client = (trx as unknown as { client?: { config?: { client?: string } } })?.client?.config?.client;
    const isPostgres = client === 'pg' || client === 'postgres' || client === 'postgresql';
    const castExpression = isPostgres
      ? "CAST(amount AS NUMERIC)"
      : "CAST(amount AS DECIMAL(65,0))";

    const result = await trx<LedgerEntryRecord>('ledger_entries')
      .where('wallet_id', walletId)
      .select(
        trx.raw(
          `COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN ${castExpression} ELSE -${castExpression} END), 0) as net_balance`
        )
      )
      .first();

    const value = (result as unknown as Record<string, unknown>)?.net_balance;
    return value == null ? '0' : normalizeBalance(String(value));
  }

  public async findByWalletId(
    walletId: string,
    trx: Knex.Transaction,
    options?: { limit?: number; offset?: number; orderBy?: SortOrder }
  ): Promise<LedgerEntryRecord[]> {
    if (typeof walletId !== 'string' || walletId.trim().length === 0) {
      throw new RepositoryException(
        'Invalid wallet identifier for ledger query.',
        `walletId=${walletId} is not a valid identifier.`
      );
    }

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const orderBy = options?.orderBy ?? SortOrder.DESC;

    if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
      throw new RepositoryException(
        'Invalid limit for ledger query.',
        `limit=${limit} is not between 1 and 1000.`
      );
    }

    if (!Number.isInteger(offset) || offset < 0) {
      throw new RepositoryException(
        'Invalid offset for ledger query.',
        `offset=${offset} is not a non-negative integer.`
      );
    }

    const query = trx<LedgerEntryRecord>('ledger_entries')
      .where('wallet_id', walletId)
      .select('*')
      .orderBy('created_at', orderBy)
      .limit(limit)
      .offset(offset);

    const entries = await query;
    return entries.map(normalizeLedgerEntryRecord);
  }

  public async countByWalletId(walletId: string, trx: Knex.Transaction): Promise<number> {
    if (typeof walletId !== 'string' || walletId.trim().length === 0) {
      throw new RepositoryException(
        'Invalid wallet identifier for entry count.',
        `walletId=${walletId} is not a valid identifier.`
      );
    }

    const result = await trx<LedgerEntryRecord>('ledger_entries')
      .where('wallet_id', walletId)
      .count('id as count')
      .first();

    const count = (result as unknown as { count?: number | string })?.count ?? 0;
    return typeof count === 'string' ? parseInt(count, 10) : (count as number);
  }
}
