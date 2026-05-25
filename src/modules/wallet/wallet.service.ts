import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import type { IWalletRepository } from './wallet.repository.interface';
import type { ILedgerRepository } from '../ledger/ledger.repository.interface';
import { InsufficientFundsException, BadRequestException } from '../../common/exceptions/http.exception';
import { ErrorLogger } from '../../common/filters/error.middleware';
import { LedgerEntryType, LogLevel, ErrorCode } from '../../common/enums';
import db from '../../../config/database';
import { withTransaction } from '../../common/db/transaction.helper';
import { transactionCounter } from '../../common/telemetry/metrics';
import { normalizeAmount, parseBalance, subtractKobo, addKobo, koboToString } from '../../common/utils/money';

export interface TransferResult {
  transactionRef: string;
  senderUserId: string;
  receiverUserId: string;
  amount: string;
  senderNewBalance: string;
  receiverNewBalance: string;
  debitEntryId: string;
  creditEntryId: string;
  timestamp: Date;
}

export interface ReconciliationResult {
  walletId: string;
  ledgerSum: string;
  cachedBalance: string;
  isBalanced: boolean;
  discrepancy: string;
}

export interface FundResult {
  transactionRef: string;
  userId: string;
  amount: string;
  newBalance: string;
  creditEntryId: string;
  timestamp: Date;
}

export interface WithdrawalResult {
  transactionRef: string;
  userId: string;
  amount: string;
  newBalance: string;
  debitEntryId: string;
  timestamp: Date;
}

export class WalletService {
  private readonly walletRepository: IWalletRepository;
  private readonly ledgerRepository: ILedgerRepository;
  private readonly serviceName: string = 'WalletService';

  constructor(
    walletRepository: IWalletRepository,
    ledgerRepository: ILedgerRepository
  ) {
    this.walletRepository = walletRepository;
    this.ledgerRepository = ledgerRepository;
  }

  private parseAmount(rawAmount: string): { amountKobo: bigint; normalizedAmount: string } {
    try {
      return normalizeAmount(rawAmount);
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid amount',
        ErrorCode.AMOUNT_INVALID
      );
    }
  }

  private ensureWalletExists(wallet: Awaited<ReturnType<IWalletRepository['findByWalletId']>>, errorMessage: string) {
    if (!wallet) {
      throw new BadRequestException(errorMessage, ErrorCode.WALLET_NOT_FOUND);
    }
    return wallet;
  }

  private buildTransactionRef(prefix: string): string {
    return `${prefix}-${randomUUID()}`;
  }

  public async processTransfer(
    senderUserId: string,
    receiverUserId: string,
    rawAmount: string
  ): Promise<TransferResult> {
    if (senderUserId === receiverUserId) {
      throw new BadRequestException(
        'Sender and receiver cannot be the same user.',
        ErrorCode.SELF_TRANSFER_NOT_ALLOWED
      );
    }

    const { amountKobo: transferAmountKobo, normalizedAmount } = this.parseAmount(rawAmount);

    // Deterministic lock ordering to prevent deadlock
    const [firstUserId, secondUserId] = senderUserId < receiverUserId
      ? [senderUserId, receiverUserId]
      : [receiverUserId, senderUserId];

    const transactionRef = this.buildTransactionRef('TXN');

    return withTransaction(db, async (trx: Knex.Transaction) => {
      const firstWallet = await this.walletRepository.findByUserIdForUpdate(firstUserId, trx);
      if (!firstWallet) {
        throw new BadRequestException(
          'One or both wallets not found for this transfer.',
          ErrorCode.WALLET_NOT_FOUND
        );
      }

      const secondWallet = await this.walletRepository.findByUserIdForUpdate(secondUserId, trx);
      if (!secondWallet) {
        throw new BadRequestException(
          'One or both wallets not found for this transfer.',
          ErrorCode.WALLET_NOT_FOUND
        );
      }

      const senderWalletId = senderUserId === firstUserId ? firstWallet.id : secondWallet.id;
      const receiverWalletId = receiverUserId === firstUserId ? firstWallet.id : secondWallet.id;

      const senderWallet = senderUserId === firstUserId ? firstWallet : secondWallet;
      const receiverWallet = receiverUserId === firstUserId ? firstWallet : secondWallet;

      const currentSenderBalance = parseBalance(senderWallet.balance);

      if (currentSenderBalance < transferAmountKobo) {
        throw new InsufficientFundsException('Insufficient funds for this transfer.');
      }

      await this.walletRepository.decrementBalance(senderWalletId, normalizedAmount, trx);
      await this.walletRepository.incrementBalance(receiverWalletId, normalizedAmount, trx);

      const updatedSender = await this.walletRepository.findByWalletId(senderWalletId, trx);
      const updatedReceiver = await this.walletRepository.findByWalletId(receiverWalletId, trx);

      const debitEntry = await this.ledgerRepository.createEntry({
        walletId: senderWalletId,
        amount: normalizedAmount,
        type: LedgerEntryType.DEBIT,
        description: `Transfer to user ${receiverUserId} | Ref: ${transactionRef}`,
      }, trx);

      const creditEntry = await this.ledgerRepository.createEntry({
        walletId: receiverWalletId,
        amount: normalizedAmount,
        type: LedgerEntryType.CREDIT,
        description: `Transfer from user ${senderUserId} | Ref: ${transactionRef}`,
      }, trx);

      const timestamp = new Date();

      transactionCounter.inc({ type: 'transfer' });
      ErrorLogger.log(LogLevel.INFO, 'Transfer completed successfully', new Error('transfer_success'), {
        service: this.serviceName,
        transactionRef,
        senderUserId,
        receiverUserId,
        amount: normalizedAmount,
      });

      return {
        transactionRef,
        senderUserId,
        receiverUserId,
        amount: normalizedAmount,
        senderNewBalance: updatedSender?.balance ?? koboToString(subtractKobo(currentSenderBalance, transferAmountKobo)),
        receiverNewBalance: updatedReceiver?.balance ?? koboToString(addKobo(parseBalance(receiverWallet.balance), transferAmountKobo)),
        debitEntryId: debitEntry.id,
        creditEntryId: creditEntry.id,
        timestamp,
      };
    });
  }

  public async calculateAuditBalance(walletId: string): Promise<ReconciliationResult> {
    return withTransaction(db, async (trx: Knex.Transaction) => {
      const wallet = await this.walletRepository.findByWalletId(walletId, trx);
      if (!wallet) {
        throw new BadRequestException('Wallet not found.', ErrorCode.WALLET_NOT_FOUND);
      }

      const ledgerSumResult = await this.ledgerRepository.sumByWalletId(walletId, trx);
      const ledgerSum = parseBalance(ledgerSumResult);
      const cachedBalance = parseBalance(wallet.balance);
      const discrepancy = ledgerSum > cachedBalance ? ledgerSum - cachedBalance : cachedBalance - ledgerSum;
      const isBalanced = discrepancy === 0n;

      if (!isBalanced) {
        ErrorLogger.log(LogLevel.FATAL, 'CRITICAL: Wallet balance mismatch detected - possible data corruption or unauthorized modification', new Error('RECONCILIATION_FAILURE'), {
          service: this.serviceName,
          walletId,
          ledgerSum: koboToString(ledgerSum),
          cachedBalance: koboToString(cachedBalance),
          discrepancy: koboToString(discrepancy),
          severity: 'CRITICAL',
          alertType: 'BALANCE_MISMATCH',
          requiresInvestigation: true,
          timestamp: new Date().toISOString(),
        });
      } else {
        ErrorLogger.log(LogLevel.INFO, 'Reconciliation check passed', new Error('reconciliation_ok'), {
          service: this.serviceName,
          walletId,
          ledgerSum: koboToString(ledgerSum),
          cachedBalance: koboToString(cachedBalance),
        });
      }

      return {
        walletId,
        ledgerSum: koboToString(ledgerSum),
        cachedBalance: koboToString(cachedBalance),
        isBalanced,
        discrepancy: koboToString(discrepancy),
      };
    });
  }

  public async getWalletBalance(userId: string): Promise<string> {
    return withTransaction(db, async (trx: Knex.Transaction) => {
      const wallet = await this.walletRepository.findByUserId(userId, trx);
      if (!wallet) {
        throw new BadRequestException(
          'Wallet not found. User must have an active wallet.',
          ErrorCode.WALLET_NOT_FOUND
        );
      }

      return wallet.balance;
    });
  }

  public async getOrCreateWallet(userId: string): Promise<{ walletId: string; balance: string; isNew: boolean }> {
    return withTransaction(db, async (trx: Knex.Transaction) => {
      let wallet = await this.walletRepository.findByUserId(userId, trx);
      let isNew = false;

      if (!wallet) {
        wallet = await this.walletRepository.createWallet(userId, trx);
        isNew = true;
      }

      return {
        walletId: wallet!.id,
        balance: wallet!.balance,
        isNew,
      };
    });
  }

  public async processFund(userId: string, rawAmount: string): Promise<FundResult> {
    const { amountKobo: fundAmountKobo, normalizedAmount } = this.parseAmount(rawAmount);
    const transactionRef = this.buildTransactionRef('FND');

    return withTransaction(db, async (trx: Knex.Transaction) => {
      const wallet = await this.walletRepository.findByUserIdForUpdate(userId, trx);
      if (!wallet) {
        throw new BadRequestException(
          'Wallet not found. Please ensure you have an active wallet.',
          ErrorCode.WALLET_NOT_FOUND
        );
      }

      await this.walletRepository.incrementBalance(wallet.id, normalizedAmount, trx);

      const creditEntry = await this.ledgerRepository.createEntry({
        walletId: wallet.id,
        amount: normalizedAmount,
        type: LedgerEntryType.CREDIT,
        description: `Wallet funding | Ref: ${transactionRef}`,
      }, trx);

      const updatedWallet = await this.walletRepository.findByWalletId(wallet.id, trx);
      const currentBalance = updatedWallet?.balance ?? koboToString(addKobo(parseBalance(wallet.balance), fundAmountKobo));
      const timestamp = new Date();

      transactionCounter.inc({ type: 'fund' });
      ErrorLogger.log(LogLevel.INFO, 'Wallet funding completed successfully', new Error('fund_success'), {
        service: this.serviceName,
        transactionRef,
        userId,
        amount: normalizedAmount,
      });

      return {
        transactionRef,
        userId,
        amount: normalizedAmount,
        newBalance: currentBalance,
        creditEntryId: creditEntry.id,
        timestamp,
      };
    });
  }

  public async processWithdrawal(userId: string, rawAmount: string): Promise<WithdrawalResult> {
    const { amountKobo: withdrawalAmountKobo, normalizedAmount } = this.parseAmount(rawAmount);
    const transactionRef = this.buildTransactionRef('WTH');

    return withTransaction(db, async (trx: Knex.Transaction) => {
      const wallet = await this.walletRepository.findByUserIdForUpdate(userId, trx);
      if (!wallet) {
        throw new BadRequestException(
          'Wallet not found. Please ensure you have an active wallet.',
          ErrorCode.WALLET_NOT_FOUND
        );
      }

      const currentBalance = parseBalance(wallet.balance);

      if (currentBalance < withdrawalAmountKobo) {
        throw new InsufficientFundsException('Insufficient funds for withdrawal.');
      }

      await this.walletRepository.decrementBalance(wallet.id, normalizedAmount, trx);

      const debitEntry = await this.ledgerRepository.createEntry({
        walletId: wallet.id,
        amount: normalizedAmount,
        type: LedgerEntryType.DEBIT,
        description: `Withdrawal | Ref: ${transactionRef}`,
      }, trx);

      const updatedWalletAfter = await this.walletRepository.findByWalletId(wallet.id, trx);
      const finalBalance = updatedWalletAfter?.balance ?? koboToString(subtractKobo(currentBalance, withdrawalAmountKobo));

      const timestamp = new Date();

      transactionCounter.inc({ type: 'withdraw' });
      ErrorLogger.log(LogLevel.INFO, 'Withdrawal completed successfully', new Error('withdrawal_success'), {
        service: this.serviceName,
        transactionRef,
        userId,
        amount: normalizedAmount,
      });

      return {
        transactionRef,
        userId,
        amount: normalizedAmount,
        newBalance: finalBalance,
        debitEntryId: debitEntry.id,
        timestamp,
      };
    });
  }
}
