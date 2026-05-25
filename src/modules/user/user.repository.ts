import type { Knex } from 'knex';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../../../config/environment';
import { RepositoryException } from '../../common/exceptions/repository.exception';
import { ErrorCode } from '../../common/enums';

export interface UserRecord {
  id: string;
  email: string;
  bvn: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserParams {
  email: string;
  bvn: string;
  password: string;
}

const SALT_ROUNDS = typeof config.security?.passwordSaltRounds === 'number' ? config.security!.passwordSaltRounds : 12;

export class UserRepository {
  // Solves the 72-byte bcrypt truncation security flaw entirely
  private hashPasswordBeforeBcrypt(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  public async createUser(
    params: CreateUserParams,
    trx: Knex.Transaction
  ): Promise<UserRecord> {
    const normalizedEmail = this.normalizeEmail(params.email);
    const normalizedBvn = this.normalizeBvn(params.bvn);
    const trimmedPassword = this.validatePassword(params.password);

    if (!this.isValidEmail(normalizedEmail)) {
      throw new RepositoryException('Invalid email format.', `email=${params.email} failed validation.`, ErrorCode.INVALID_USER_ID);
    }

    if (!this.isValidBvn(normalizedBvn)) {
      throw new RepositoryException('Invalid BVN format.', `bvn=${params.bvn} is not 11 digits.`, ErrorCode.INVALID_BVN_FORMAT);
    }

    // Pre-hash password before passing to bcrypt to avoid bcrypt 72-byte truncation
    const preHashedPassword = this.hashPasswordBeforeBcrypt(trimmedPassword);
    const passwordHash = await bcrypt.hash(preHashedPassword, SALT_ROUNDS);

    const insertedUser = await trx<UserRecord>('users')
      .insert({
        email: normalizedEmail,
        bvn: normalizedBvn,
        password_hash: passwordHash,
      })
      .returning('*')
      .then((rows) => Array.isArray(rows) ? rows[0] : rows);

    if (!insertedUser) {
      throw new RepositoryException(
        'User creation failed.',
        `Insert did not return a user row for email=${normalizedEmail}`
      );
    }

    return insertedUser as UserRecord;
  }

  public async findById(
    userId: string,
    trx: Knex.Transaction
  ): Promise<UserRecord | null> {
    const user = await trx<UserRecord>('users')
      .where('id', userId)
      .first();

    return user ?? null;
  }

  public async findByEmail(
    email: string,
    trx: Knex.Transaction
  ): Promise<UserRecord | null> {
    const normalizedEmail = this.normalizeEmail(email);

    const user = await trx<UserRecord>('users')
      .where('email', normalizedEmail)
      .first();

    return user ?? null;
  }

  public async findByBvn(
    bvn: string,
    trx: Knex.Transaction
  ): Promise<UserRecord | null> {
    const normalizedBvn = this.normalizeBvn(bvn);

    const user = await trx<UserRecord>('users')
      .where('bvn', normalizedBvn)
      .first();

    return user ?? null;
  }

  public async emailExists(
    email: string,
    trx: Knex.Transaction
  ): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!this.isValidEmail(normalizedEmail)) {
      return false;
    }

    const result = await trx<UserRecord>('users')
      .where('email', normalizedEmail)
      .select('id')
      .first();

    return result !== undefined;
  }

  public async bvnExists(
    bvn: string,
    trx: Knex.Transaction
  ): Promise<boolean> {
    const normalizedBvn = this.normalizeBvn(bvn);

    if (!this.isValidBvn(normalizedBvn)) {
      return false;
    }

    const result = await trx<UserRecord>('users')
      .where('bvn', normalizedBvn)
      .select('id')
      .first();

    return result !== undefined;
  }

  public async updatePassword(
    userId: string,
    newPassword: string,
    trx: Knex.Transaction
  ): Promise<void> {
    const trimmedPassword = this.validatePassword(newPassword);

    const preHashedPassword = this.hashPasswordBeforeBcrypt(trimmedPassword);
    const passwordHash = await bcrypt.hash(preHashedPassword, SALT_ROUNDS);

    const rowsAffected = await trx<UserRecord>('users')
      .where('id', userId)
      .update({
        password_hash: passwordHash,
        updated_at: trx.fn.now(),
      });

    if (rowsAffected === 0) {
      throw new RepositoryException('Failed to update password.', `userId=${userId} not found.`);
    }
  }

  public async verifyPassword(
    userId: string,
    password: string,
    trx: Knex.Transaction
  ): Promise<boolean> {
    const user = await this.findById(userId, trx);
    if (!user) {
      throw new RepositoryException('User not found.', `userId=${userId} does not exist.`, ErrorCode.USER_NOT_FOUND);
    }

    const trimmedPassword = password.trim();
    const preHashedPassword = this.hashPasswordBeforeBcrypt(trimmedPassword);
    return bcrypt.compare(preHashedPassword, user.password_hash);
  }

  public async countUsers(trx: Knex.Transaction): Promise<number> {
    const result = await trx<UserRecord>('users')
      .count('id as count')
      .first();

    const count = (result as unknown as { count?: number | string })?.count ?? 0;
    return typeof count === 'string' ? parseInt(count, 10) : (count as number);
  }

  private validatePassword(password: string): string {
    const trimmedPassword = password.trim();

    if (trimmedPassword.length < 8) {
      throw new RepositoryException('Password too short.', 'Password must be at least 8 characters.', ErrorCode.PASSWORD_TOO_SHORT);
    }

    if (trimmedPassword.length > 128) {
      throw new RepositoryException('Password too long.', 'Password exceeds 128 character limit.', ErrorCode.PASSWORD_TOO_SHORT);
    }

    return trimmedPassword;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeBvn(bvn: string): string {
    return bvn.trim();
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  }

  private isValidBvn(bvn: string): boolean {
    return /^\d{11}$/.test(bvn);
  }
}