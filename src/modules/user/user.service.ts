import type { Knex } from 'knex';
import jwt from 'jsonwebtoken';
import type { IUserRepository } from './user.repository.interface';
import type { IWalletRepository } from '../wallet/wallet.repository.interface';
import { blacklistModule } from '../blacklist/blacklist.module';
import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '../../common/exceptions/http.exception';
import { ErrorLogger } from '../../common/filters/error.middleware';
import { LogLevel, ErrorCode } from '../../common/enums';
import { config } from '../../../config/environment';
import db from '../../../config/database';
import { withTransaction } from '../../common/db/transaction.helper';

export interface RegisterUserParams {
  email: string;
  bvn: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber?: string;
}

export interface RegisteredUserResult {
  userId: string;
  walletId: string;
  email: string;
  bvn: string;
  balance: string;
  isNew: boolean;
  timestamp: Date;
}

export class UserService {
  private readonly userRepository: IUserRepository;
  private readonly walletRepository: IWalletRepository;
  private readonly serviceName: string = 'UserService';

  constructor(
    userRepository: IUserRepository,
    walletRepository: IWalletRepository
  ) {
    this.userRepository = userRepository;
    this.walletRepository = walletRepository;
  }

  public async registerUser(params: RegisterUserParams): Promise<RegisteredUserResult> {
    const { email, bvn, password, firstName, lastName, dateOfBirth, phoneNumber } = params;

    const identityRequest = {
      bvn,
      firstName,
      lastName,
      dateOfBirth,
      phoneNumber: phoneNumber || undefined,
    };

    let verificationResult;
    try {
      verificationResult = await blacklistModule.verify(identityRequest);
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        ErrorLogger.log(LogLevel.ERROR, 'User registration failed due to identity service unavailability', error as Error, {
          service: this.serviceName 
        });
        throw error;
      }

      const err = error as Error;
      ErrorLogger.log(LogLevel.ERROR, 'Unexpected error during identity verification', err, {
        service: this.serviceName,
        email,
      });
      throw new ServiceUnavailableException(
        'Identity verification service encountered an unexpected error. Please try again later.',
        'AdjutorKarmaAPI',
        60000
      );
    }

    if (verificationResult.isBlacklisted) {
      ErrorLogger.log(LogLevel.WARN, 'Blacklisted user attempted registration', new Error('BLACKLISTED_REGISTRATION'), {
        service: this.serviceName,
        email,
        bvn,
        watchList: verificationResult.watchList,
        fraudSuspected: verificationResult.fraudSuspected,
        alertType: 'BLACKLISTED_USER_BLOCKED',
      });
      throw new ForbiddenException(
        'Registration denied. The provided identity information has been flagged in our compliance system.',
        ErrorCode.USER_BLACKLISTED
      );
    }

    return withTransaction(db, async (trx: Knex.Transaction) => {
      const existingEmailUser = await this.userRepository.findByEmail(email, trx);
      if (existingEmailUser) {
        throw new BadRequestException(
          'Registration could not be completed. Please check your details and try again.',
          ErrorCode.REGISTRATION_FAILED
        );
      }

      const existingBvnUser = await this.userRepository.findByBvn(bvn, trx);
      if (existingBvnUser) {
        throw new BadRequestException(
          'Registration could not be completed. Please check your details and try again.',
          ErrorCode.REGISTRATION_FAILED
        );
      }

      const user = await this.userRepository.createUser(
        {
          email,
          bvn,
          password,
        },
        trx
      );

      const wallet = await this.walletRepository.createWallet(user.id, trx);

      const timestamp = new Date();

      ErrorLogger.log(LogLevel.INFO, 'New user registered successfully', new Error('user_registered'), {
        service: this.serviceName,
        userId: user.id,
        email,
        bvn,
        walletId: wallet.id,
      });

      return {
        userId: user.id,
        walletId: wallet.id,
        email: user.email,
        bvn: user.bvn,
        balance: wallet.balance,
        isNew: true,
        timestamp,
      };
    });
  }

  public async getUserById(userId: string): Promise<{ id: string; email: string; bvn: string; createdAt: Date } | null> {
    return withTransaction(db, async (trx: Knex.Transaction) => {
      const user = await this.userRepository.findById(userId, trx);
      if (!user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        bvn: user.bvn,
        createdAt: user.created_at,
      };
    });
  }

  public async getUserByEmail(email: string): Promise<{ id: string; email: string; bvn: string; createdAt: Date } | null> {
    return withTransaction(db, async (trx: Knex.Transaction) => {
      const user = await this.userRepository.findByEmail(email, trx);
      if (!user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        bvn: user.bvn,
        createdAt: user.created_at,
      };
    });
  }

  public async authenticateUser(email: string, password: string): Promise<{ userId: string; email: string; token: string; refreshToken: string } | null> {
    return withTransaction(db, async (trx: Knex.Transaction) => {
      const user = await this.userRepository.findByEmail(email, trx);
      if (!user) {
        return null;
      }

      const isPasswordValid = await this.userRepository.verifyPassword(user.id, password, trx);
      if (!isPasswordValid) {
        return null;
      }

      const token = jwt.sign(
        { sub: user.id },
        config.jwt.secret as string,
        { expiresIn: config.jwt.expiresIn } as object
      ) as string;

      const refreshToken = jwt.sign(
        { sub: user.id },
        config.jwt.refreshSecret as string,
        { expiresIn: config.jwt.refreshExpiresIn } as object
      ) as string;

      return {
        userId: user.id,
        email: user.email,
        token,
        refreshToken,
      };
    });
  }
}
