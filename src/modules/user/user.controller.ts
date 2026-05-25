import type { Request, Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { BadRequestException, ForbiddenException } from '../../common/exceptions/http.exception';
import { ResponseHelper } from '../../common/response';
import { ErrorCode, HttpStatus } from '../../common/enums';
import jwt from 'jsonwebtoken';
import { config } from '../../../config/environment';
import { getAuthenticatedUserId } from '../../common/utils/express';

export interface RegisterUserRequestBody {
  email: string;
  bvn: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber?: string;
}

export interface RegisterUserResponse {
  userId: string;
  walletId: string;
  email: string;
  balance: string;
  timestamp: string;
}

export interface GetUserResponse {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthenticateRequestBody {
  email: string;
  password: string;
}

export interface RefreshTokenRequestBody {
  refreshToken: string;
}

export interface AuthenticateResponse {
  userId: string;
  email: string;
  token?: string;
  refreshToken?: string;
}

export class UserController {
  private readonly userService: UserService;
  private readonly serviceName: string = 'UserController';

  constructor(userService: UserService) {
    this.userService = userService;
  }

  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as RegisterUserRequestBody;

      const result = await this.userService.registerUser({
        email: body.email,
        bvn: body.bvn,
        password: body.password,
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth,
        phoneNumber: body.phoneNumber,
      });

      const response: RegisterUserResponse = {
        userId: result.userId,
        walletId: result.walletId,
        email: result.email,
        balance: result.balance,
        timestamp: result.timestamp.toISOString(),
      };

      ResponseHelper.created(res, response);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      const user = await this.userService.getUserById(userId);

      if (!user) {
        throw new BadRequestException('User not found.', ErrorCode.USER_NOT_FOUND);
      }

      const response: GetUserResponse = {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      };

      ResponseHelper.success(res, response);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as AuthenticateRequestBody;
      const result = await this.userService.authenticateUser(body.email, body.password);

      if (!result) {
        ResponseHelper.error(res, 'Invalid email or password. Please try again.', ErrorCode.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
        return;
      }

      const response: AuthenticateResponse = {
        userId: result.userId,
        email: result.email,
        token: result.token,
        refreshToken: result.refreshToken,
      };

      ResponseHelper.success(res, response);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as RefreshTokenRequestBody;

      const decoded = jwt.verify(
        body.refreshToken,
        config.jwt.refreshSecret as string
      ) as unknown as { sub: string };

      const token = jwt.sign(
        { sub: decoded.sub },
        config.jwt.secret as string,
        { expiresIn: config.jwt.expiresIn } as object
      ) as string;

      const newRefreshToken = jwt.sign(
        { sub: decoded.sub },
        config.jwt.refreshSecret as string,
        { expiresIn: config.jwt.refreshExpiresIn } as object
      ) as string;

      ResponseHelper.success(res, {
        userId: decoded.sub,
        email: '',
        token,
        refreshToken: newRefreshToken,
      });
    } catch (error: unknown) {
      if (error instanceof ForbiddenException || error instanceof BadRequestException) {
        next(error);
        return;
      }
      next(new ForbiddenException('Invalid or expired refresh token.', ErrorCode.INVALID_AUTH_TOKEN));
    }
  }
}