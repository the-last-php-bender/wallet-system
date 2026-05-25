import type { Request, Response, NextFunction } from 'express';
import { WalletService } from './wallet.service';
import { BadRequestException } from '../../common/exceptions/http.exception';
import { ResponseHelper } from '../../common/response';
import { HealthStatus, ServiceStatus, ServiceHealth, ResponseStatus, ErrorCode, HttpStatus } from '../../common/enums';
import { getAuthenticatedUserId } from '../../common/utils/express';

export interface FundRequestBody {
  amount: string;
}

export interface TransferRequestBody {
  receiverUserId: string;
  amount: string;
}

export interface WithdrawalRequestBody {
  amount: string;
}

export interface WalletBalanceResponse {
  walletId: string;
  balance_in_kobo: string;
  currency: string;
  isNew: boolean;
}

export interface TransferResponse {
  transactionRef: string;
  senderUserId: string;
  receiverUserId: string;
  amount_in_kobo: string;
  sender_new_balance_in_kobo: string;
  receiver_new_balance_in_kobo: string;
  currency: string;
  timestamp: string;
}

export interface WithdrawalResponse {
  transactionRef: string;
  userId: string;
  amount_in_kobo: string;
  new_balance_in_kobo: string;
  currency: string;
  timestamp: string;
}

export interface FundResponse {
  transactionRef: string;
  userId: string;
  amount_in_kobo: string;
  new_balance_in_kobo: string;
  currency: string;
  creditEntryId: string;
  timestamp: string;
}

export interface ReconciliationResponse {
  walletId: string;
  ledger_sum_in_kobo: string;
  cached_balance_in_kobo: string;
  isBalanced: boolean;
  discrepancy_in_kobo: string;
  currency: string;
}

export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  services: {
    database: ServiceStatus;
    walletService: ServiceHealth;
    ledgerService: ServiceHealth;
  };
}

export class WalletController {
  private readonly walletService: WalletService;
  private readonly serviceName: string = 'WalletController';

  constructor(walletService: WalletService) {
    this.walletService = walletService;
  }

  public async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      const walletResult = await this.walletService.getOrCreateWallet(userId);

      const response: WalletBalanceResponse = {
        walletId: walletResult.walletId,
        balance_in_kobo: walletResult.balance,
        currency: 'NGN',
        isNew: walletResult.isNew,
      };

      ResponseHelper.success(res, response);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async fund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      const body = req.body as FundRequestBody;
      const result = await this.walletService.processFund(userId, body.amount);

      const response: FundResponse = {
        transactionRef: result.transactionRef,
        userId: result.userId,
        amount_in_kobo: result.amount,
        new_balance_in_kobo: result.newBalance,
        currency: 'NGN',
        creditEntryId: result.creditEntryId,
        timestamp: result.timestamp.toISOString(),
      };

      ResponseHelper.success(res, response);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async transfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const senderUserId = getAuthenticatedUserId(req);
      const body = req.body as TransferRequestBody;
      const result = await this.walletService.processTransfer(
        senderUserId,
        body.receiverUserId,
        body.amount
      );

      const response: TransferResponse = {
        transactionRef: result.transactionRef,
        senderUserId: result.senderUserId,
        receiverUserId: result.receiverUserId,
        amount_in_kobo: result.amount,
        sender_new_balance_in_kobo: result.senderNewBalance,
        receiver_new_balance_in_kobo: result.receiverNewBalance,
        currency: 'NGN',
        timestamp: result.timestamp.toISOString(),
      };

      ResponseHelper.success(res, response);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async withdraw(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      const body = req.body as WithdrawalRequestBody;
      const result = await this.walletService.processWithdrawal(userId, body.amount);

      const response: WithdrawalResponse = {
        transactionRef: result.transactionRef,
        userId: result.userId,
        amount_in_kobo: result.amount,
        new_balance_in_kobo: result.newBalance,
        currency: 'NGN',
        timestamp: result.timestamp.toISOString(),
      };

      ResponseHelper.success(res, response);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async reconcile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      const walletResult = await this.walletService.getOrCreateWallet(userId);

      const reconciliation = await this.walletService.calculateAuditBalance(walletResult.walletId);

      const response: ReconciliationResponse = {
        walletId: reconciliation.walletId,
        ledger_sum_in_kobo: reconciliation.ledgerSum,
        cached_balance_in_kobo: reconciliation.cachedBalance,
        isBalanced: reconciliation.isBalanced,
        discrepancy_in_kobo: reconciliation.discrepancy,
        currency: 'NGN',
      };

      const statusCode = reconciliation.isBalanced ? HttpStatus.OK : HttpStatus.CONFLICT;

      ResponseHelper.json(res, {
        status: reconciliation.isBalanced ? ResponseStatus.SUCCESS : ResponseStatus.ERROR,
        code: reconciliation.isBalanced ? ErrorCode.BALANCE_RECONCILED : ErrorCode.BALANCE_MISMATCH,
        data: response,
      }, statusCode);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async healthCheck(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const response: HealthCheckResponse = {
        status: HealthStatus.OK,
        timestamp: new Date().toISOString(),
        services: {
          database: ServiceStatus.CONNECTED,
          walletService: ServiceHealth.HEALTHY,
          ledgerService: ServiceHealth.HEALTHY,
        },
      };

      ResponseHelper.success(res, response);
    } catch (error: unknown) {
      const response: HealthCheckResponse = {
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date().toISOString(),
        services: {
          database: ServiceStatus.DISCONNECTED,
          walletService: ServiceHealth.UNHEALTHY,
          ledgerService: ServiceHealth.UNHEALTHY,
        },
      };

      ResponseHelper.json(res, {
        status: ResponseStatus.ERROR,
        data: response,
      }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
