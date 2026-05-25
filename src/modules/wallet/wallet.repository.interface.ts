import type { Knex } from 'knex';

export interface IWalletRepository {
  findByUserIdForUpdate(userId: string, trx: Knex.Transaction): Promise<{
    id: string;
    user_id: string;
    balance: string;
    created_at: Date;
    updated_at: Date;
  } | null>;

  findByUserId(userId: string, trx: Knex.Transaction): Promise<{
    id: string;
    user_id: string;
    balance: string;
    created_at: Date;
    updated_at: Date;
  } | null>;

  findByWalletId(walletId: string, trx: Knex.Transaction): Promise<{
    id: string;
    user_id: string;
    balance: string;
    created_at: Date;
    updated_at: Date;
  } | null>;

  updateBalance(walletId: string, amount: string, trx: Knex.Transaction): Promise<void>;

  createWallet(userId: string, trx: Knex.Transaction): Promise<{
    id: string;
    user_id: string;
    balance: string;
    created_at: Date;
    updated_at: Date;
  }>;

  incrementBalance(walletId: string, amount: string, trx: Knex.Transaction): Promise<void>;

  decrementBalance(walletId: string, amount: string, trx: Knex.Transaction): Promise<void>;

  validateBalance(walletId: string, requiredAmount: string, trx: Knex.Transaction): Promise<boolean>;

  lockAndValidateBalance(walletId: string, requiredAmount: string, trx: Knex.Transaction): Promise<{
    wallet: {
      id: string;
      user_id: string;
      balance: string;
      created_at: Date;
      updated_at: Date;
    };
    isSufficient: boolean;
  }>;
}