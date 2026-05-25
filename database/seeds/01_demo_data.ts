import type { Knex } from 'knex';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

interface DemoUser {
  email: string;
  bvn: string;
  password: string;
  balance: string;
}

const demoUsers: DemoUser[] = [
  {
    email: 'alice@example.com',
    bvn: '12345678901',
    password: 'Password123!',
    balance: '90000',
  },
  {
    email: 'bob@example.com',
    bvn: '23456789012',
    password: 'Password123!',
    balance: '250050',
  },
  {
    email: 'carol@example.com',
    bvn: '34567890123',
    password: 'Password123!',
    balance: '50000',
  },
];

export async function seed(knex: Knex): Promise<void> {
  for (const demoUser of demoUsers) {
    const existingUser = await knex('users').where('email', demoUser.email).first();
    const preHashedPassword = crypto.createHash('sha256').update(demoUser.password).digest('hex');
    const passwordHash = await bcrypt.hash(preHashedPassword, 10);
    let userId: string;

    if (!existingUser) {
      await knex('users').insert({
        email: demoUser.email,
        bvn: demoUser.bvn,
        password_hash: passwordHash,
      });

      const insertedUser = await knex('users')
        .where('email', demoUser.email)
        .first();

      if (!insertedUser) {
        throw new Error(`Failed to retrieve inserted demo user for email=${demoUser.email}`);
      }

      userId = insertedUser.id as string;
    } else {
      userId = existingUser.id as string;
    }

    const existingWallet = await knex('wallets').where({ user_id: userId }).first();
    let walletId: string;

    if (!existingWallet) {
      await knex('wallets').insert({
        user_id: userId,
        balance: demoUser.balance,
      });

      const insertedWallet = await knex('wallets')
        .where('user_id', userId)
        .first();

      if (!insertedWallet) {
        throw new Error(`Failed to retrieve inserted wallet for userId=${userId}`);
      }

      walletId = insertedWallet.id as string;
    } else {
      walletId = existingWallet.id as string;
    }

    const countResult = await knex('ledger_entries')
      .where({ wallet_id: walletId })
      .count<{ count: number }>('id as count')
      .first();

    const existingLedgerCount = Number(countResult?.count ?? 0);

    if (existingLedgerCount === 0) {
      await knex('ledger_entries').insert({
        wallet_id: walletId,
        amount: demoUser.balance,
        type: 'CREDIT',
        description: `Demo funding for ${demoUser.email}`,
      });
    }
  }
}
