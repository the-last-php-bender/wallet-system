import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { WalletRepository } from '../wallet/wallet.repository';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { authLimiter } from '../../common/guards/rate-limiter';
import { ErrorLogger } from '../../common/filters/error.middleware';
import { LogLevel } from '../../common/enums';
import { validateBody } from '../../common/middleware/validation.middleware';
import { registerUserSchema, authenticateUserSchema, refreshTokenSchema } from './user.validation';

export { UserRepository } from './user.repository';
export type { UserRecord, CreateUserParams } from './user.repository';
export type { IUserRepository } from './user.repository.interface';
export { UserService } from './user.service';
export type { RegisterUserParams, RegisteredUserResult } from './user.service';
export { UserController } from './user.controller';
export type {
  RegisterUserRequestBody,
  RegisterUserResponse,
  GetUserResponse,
  AuthenticateRequestBody,
  AuthenticateResponse,
  RefreshTokenRequestBody,
} from './user.controller';

export class UserModule {
  private static router: Router | null = null;
  private static userService: UserService | null = null;
  private static controller: UserController | null = null;

  public static bootstrap(): Router {
    if (UserModule.router !== null) {
      return UserModule.router;
    }

    const userRepository = new UserRepository();
    const walletRepository = new WalletRepository();
    UserModule.userService = new UserService(userRepository, walletRepository);
    UserModule.controller = new UserController(UserModule.userService);

    const router = Router();

    router.post('/register', authLimiter, validateBody(registerUserSchema), (req: Request, res: Response, next: NextFunction) => {
      UserModule.controller!.register(req, res, next);
    });

    router.post('/authenticate', authLimiter, validateBody(authenticateUserSchema), (req: Request, res: Response, next: NextFunction) => {
      UserModule.controller!.authenticate(req, res, next);
    });

    router.post('/refresh', authLimiter, validateBody(refreshTokenSchema), (req: Request, res: Response, next: NextFunction) => {
      UserModule.controller!.refreshToken(req, res, next);
    });

    router.get(
      '/profile',
      authMiddleware,
      (req: Request, res: Response, next: NextFunction) => {
        UserModule.controller!.getUserById(req, res, next);
      }
    );

    ErrorLogger.log(LogLevel.INFO, 'UserModule bootstrapped successfully', new Error('module_bootstrapped'), {
      module: 'UserModule',
    });

    UserModule.router = router;
    return router;
  }

  public static getUserService(): UserService | null {
    return UserModule.userService;
  }

  public static reset(): void {
    UserModule.router = null;
    UserModule.userService = null;
    UserModule.controller = null;
  }
}
