import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE wallets
    ADD CONSTRAINT chk_wallet_balance_non_negative
    CHECK (balance >= 0)
  `);

  await knex.raw(`
    ALTER TABLE ledger_entries
    ADD CONSTRAINT chk_ledger_amount_positive
    CHECK (amount > 0)
  `);

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT chk_users_email_format
    CHECK (email REGEXP '^[a-zA-Z0-9.!#$%&''*+/=?^_\`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$')
  `);

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT chk_users_bvn_format
    CHECK (bvn REGEXP '^[0-9]{11}$')
  `);

  await knex.raw(`CREATE INDEX idx_wallets_balance ON wallets (balance)`);
  await knex.raw(`CREATE INDEX idx_ledger_entries_type ON ledger_entries (type)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE wallets DROP CHECK chk_wallet_balance_non_negative');
  await knex.raw('ALTER TABLE ledger_entries DROP CHECK chk_ledger_amount_positive');
  await knex.raw('ALTER TABLE users DROP CHECK chk_users_email_format');
  await knex.raw('ALTER TABLE users DROP CHECK chk_users_bvn_format');
  await knex.raw('DROP INDEX IF EXISTS idx_wallets_balance ON wallets');
  await knex.raw('DROP INDEX IF EXISTS idx_ledger_entries_type ON ledger_entries');
}
