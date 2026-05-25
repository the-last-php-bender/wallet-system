import type { Knex } from 'knex';
import { LedgerEntryType, SortOrder } from '../../common/enums';

export interface ILedgerRepository {
  createEntry(params: {
    walletId: string;
    amount: string;
    type: LedgerEntryType;
    description: string;
  }, trx: Knex.Transaction): Promise<{
    id: string;
    wallet_id: string;
    amount: string;
    type: LedgerEntryType;
    description: string;
    created_at: Date;
  }>;

  sumByWalletId(walletId: string, trx: Knex.Transaction): Promise<string>;

  findByWalletId(walletId: string, trx: Knex.Transaction, options?: {
    limit?: number;
    offset?: number;
    orderBy?: SortOrder;
  }): Promise<Array<{
    id: string;
    wallet_id: string;
    amount: string;
    type: LedgerEntryType;
    description: string;
    created_at: Date;
  }>>;

  countByWalletId(walletId: string, trx: Knex.Transaction): Promise<number>;
}