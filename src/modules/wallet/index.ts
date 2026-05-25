import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { LedgerRepository } from '../ledger/ledger.repository';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { walletLimiter } from '../../common/guards/rate-limiter';
import { idempotencyMiddleware } from '../../common/guards/idempotency';
import { ErrorLogger } from '../../common/filters/error.middleware';
import { LogLevel } from '../../common/enums';
import { validateBody } from '../../common/middleware/validation.middleware';
import { fundWalletSchema, transferWalletSchema, withdrawWalletSchema } from './wallet.validation';

export { WalletRepository } from './wallet.repository';
export type { WalletRecord } from './wallet.repository';
export type { IWalletRepository } from './wallet.repository.interface';
export { WalletService } from './wallet.service';
export type { TransferResult, ReconciliationResult } from './wallet.service';
export { WalletController } from './wallet.controller';
export type {
  FundRequestBody,
  TransferRequestBody,
  WithdrawalRequestBody,
  WalletBalanceResponse,
  TransferResponse,
  WithdrawalResponse,
  FundResponse,
  ReconciliationResponse,
  HealthCheckResponse,
} from './wallet.controller';

export class WalletModule {
  private static router: Router | null = null;
  private static walletService: WalletService | null = null;
  private static controller: WalletController | null = null;

  public static bootstrap(): Router {
    if (WalletModule.router !== null) {
      return WalletModule.router;
    }

    const walletRepository = new WalletRepository();
    const ledgerRepository = new LedgerRepository();
    WalletModule.walletService = new WalletService(walletRepository, ledgerRepository);
    WalletModule.controller = new WalletController(WalletModule.walletService);

    const router = Router();

    router.use(walletLimiter);

    router.get('/health', (req: Request, res: Response, next: NextFunction) => {
      WalletModule.controller!.healthCheck(req, res, next);
    });

    router.get(
      '/balance',
      authMiddleware,
      (req: Request, res: Response, next: NextFunction) => {
        WalletModule.controller!.getBalance(req, res, next);
      }
    );

    router.post(
      '/fund',
      idempotencyMiddleware,
      authMiddleware,
      validateBody(fundWalletSchema),
      (req: Request, res: Response, next: NextFunction) => {
        WalletModule.controller!.fund(req, res, next);
      }
    );

    router.post(
      '/transfer',
      idempotencyMiddleware,
      authMiddleware,
      validateBody(transferWalletSchema),
      (req: Request, res: Response, next: NextFunction) => {
        WalletModule.controller!.transfer(req, res, next);
      }
    );

    router.post(
      '/withdraw',
      idempotencyMiddleware,
      authMiddleware,
      validateBody(withdrawWalletSchema),
      (req: Request, res: Response, next: NextFunction) => {
        WalletModule.controller!.withdraw(req, res, next);
      }
    );

    router.get(
      '/reconcile',
      authMiddleware,
      (req: Request, res: Response, next: NextFunction) => {
        WalletModule.controller!.reconcile(req, res, next);
      }
    );

    ErrorLogger.log(LogLevel.INFO, 'WalletModule bootstrapped successfully', new Error('module_bootstrapped'), {
      module: 'WalletModule',
    });

    WalletModule.router = router;
    return router;
  }

  public static getWalletService(): WalletService | null {
    return WalletModule.walletService;
  }

  public static reset(): void {
    WalletModule.router = null;
    WalletModule.walletService = null;
    WalletModule.controller = null;
  }
}
