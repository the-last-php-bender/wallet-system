import type { Knex } from 'knex';
import { RepositoryException, NotFoundException } from '../../common/exceptions/repository.exception';
import { validateAmount, parseBalance, normalizeBalance } from '../../common/utils/money';
import { idGenerator } from '../../common/utils/id-generator';

export interface WalletRecord {
  id: string;
  user_id: string;
  balance: string;
  created_at: Date;
  updated_at: Date;
}

function normalizeWalletRecord(wallet: WalletRecord): WalletRecord {
  return {
    ...wallet,
    balance: normalizeBalance(wallet.balance),
  };
}

export class WalletRepository {
  public async findByUserIdForUpdate(
    userId: string,
    trx: Knex.Transaction
  ): Promise<WalletRecord | null> {
    const wallet = await trx<WalletRecord>('wallets')
      .where('user_id', userId)
      .forUpdate()
      .first();

    return wallet ? normalizeWalletRecord(wallet) : null;
  }

  public async findByUserId(
    userId: string,
    trx: Knex.Transaction
  ): Promise<WalletRecord | null> {
    const wallet = await trx<WalletRecord>('wallets')
      .where('user_id', userId)
      .first();

    return wallet ? normalizeWalletRecord(wallet) : null;
  }

  public async findByWalletId(
    walletId: string,
    trx: Knex.Transaction
  ): Promise<WalletRecord | null> {
    const wallet = await trx<WalletRecord>('wallets')
      .where('id', walletId)
      .first();

    return wallet ? normalizeWalletRecord(wallet) : null;
  }

  public async updateBalance(
    walletId: string,
    amount: string,
    trx: Knex.Transaction
  ): Promise<void> {
    const rowsAffected = await trx<WalletRecord>('wallets')
      .where('id', walletId)
      .update({
        balance: amount,
        updated_at: trx.fn.now(),
      });

    if (rowsAffected === 0) {
      throw new RepositoryException(
        'Failed to update wallet balance.',
        `Wallet not found or balance update affected 0 rows.`
      );
    }
  }

  public async createWallet(
    userId: string,
    trx: Knex.Transaction
  ): Promise<WalletRecord> {
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      throw new RepositoryException('Invalid user id for wallet creation.', `userId=${userId}`);
    }

    const walletId = idGenerator.generate();
    const now = new Date();
    const initialBalance = '0';

    await trx<WalletRecord>('wallets').insert({
      id: walletId,
      user_id: userId,
      balance: initialBalance,
      created_at: now,
      updated_at: now,
    });

    return {
      id: walletId,
      user_id: userId,
      balance: initialBalance,
      created_at: now,
      updated_at: now,
    };
  }

  public async incrementBalance(
    walletId: string,
    amount: string,
    trx: Knex.Transaction
  ): Promise<void> {
    validateAmount(amount);

    const rowsAffected = await trx<WalletRecord>('wallets')
      .where('id', walletId)
      .update({
        balance: trx.raw('CAST(CAST(balance AS DECIMAL(65,0)) + ? AS CHAR)', [amount]),
        updated_at: trx.fn.now(),
      });

    if (rowsAffected === 0) {
      throw new RepositoryException(
        'Failed to increment wallet balance.',
        `Wallet not found or balance increment affected 0 rows.`
      );
    }
  }

  public async decrementBalance(
    walletId: string,
    amount: string,
    trx: Knex.Transaction
  ): Promise<void> {
    validateAmount(amount);

    const rowsAffected = await trx<WalletRecord>('wallets')
      .where('id', walletId)
      .andWhere(trx.raw('CAST(balance AS DECIMAL(65,0)) >= ?', [amount]))
      .update({
        balance: trx.raw('CAST(CAST(balance AS DECIMAL(65,0)) - ? AS CHAR)', [amount]),
        updated_at: trx.fn.now(),
      });

    if (rowsAffected === 0) {
      throw new RepositoryException(
        'Insufficient balance for withdrawal.',
        `walletId=${walletId} lacks sufficient balance for amount=${amount} debit operation.`
      );
    }
  }

  public async validateBalance(
    walletId: string,
    requiredAmount: string,
    trx: Knex.Transaction
  ): Promise<boolean> {
    const wallet = await trx<WalletRecord>('wallets')
      .where('id', walletId)
      .select('balance')
      .first();

    if (!wallet) {
      throw new NotFoundException('Wallet');
    }

    const currentBalance = parseBalance(wallet.balance);
    let required: bigint;
    try {
      required = BigInt(requiredAmount);
    } catch {
      throw new RepositoryException(
        'Invalid amount format for balance validation.',
        `requiredAmount=${requiredAmount} could not be parsed as a valid integer.`
      );
    }

    return currentBalance >= required;
  }

  public async lockAndValidateBalance(
    walletId: string,
    requiredAmount: string,
    trx: Knex.Transaction
  ): Promise<{ wallet: WalletRecord; isSufficient: boolean }> {
    const wallet = await trx<WalletRecord>('wallets')
      .where('id', walletId)
      .forUpdate()
      .first();

    if (!wallet) {
      throw new NotFoundException('Wallet');
    }

    const currentBalance = parseBalance(wallet.balance);
    let required: bigint;
    try {
      required = BigInt(requiredAmount);
    } catch {
      throw new RepositoryException(
        'Invalid amount format for balance validation.',
        `requiredAmount=${requiredAmount} could not be parsed as a valid integer.`
      );
    }

    return {
      wallet: normalizeWalletRecord(wallet as WalletRecord),
      isSufficient: currentBalance >= required,
    };
  }
}
