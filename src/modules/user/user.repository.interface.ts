import type { Knex } from 'knex';

export interface IUserRepository {
  createUser(params: { email: string; bvn: string; password: string }, trx: Knex.Transaction): Promise<{
    id: string;
    email: string;
    bvn: string;
    password_hash: string;
    created_at: Date;
    updated_at: Date;
  }>;

  findById(userId: string, trx: Knex.Transaction): Promise<{
    id: string;
    email: string;
    bvn: string;
    password_hash: string;
    created_at: Date;
    updated_at: Date;
  } | null>;

  findByEmail(email: string, trx: Knex.Transaction): Promise<{
    id: string;
    email: string;
    bvn: string;
    password_hash: string;
    created_at: Date;
    updated_at: Date;
  } | null>;

  findByBvn(bvn: string, trx: Knex.Transaction): Promise<{
    id: string;
    email: string;
    bvn: string;
    password_hash: string;
    created_at: Date;
    updated_at: Date;
  } | null>;

  emailExists(email: string, trx: Knex.Transaction): Promise<boolean>;

  bvnExists(bvn: string, trx: Knex.Transaction): Promise<boolean>;

  updatePassword(userId: string, newPassword: string, trx: Knex.Transaction): Promise<void>;

  verifyPassword(userId: string, password: string, trx: Knex.Transaction): Promise<boolean>;

  countUsers(trx: Knex.Transaction): Promise<number>;
}