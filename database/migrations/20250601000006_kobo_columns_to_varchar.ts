import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE wallets 
    MODIFY COLUMN balance VARCHAR(64) NOT NULL DEFAULT '0'
  `);

  await knex.raw(`
    ALTER TABLE ledger_entries 
    MODIFY COLUMN amount VARCHAR(64) NOT NULL
  `);

  await knex.raw(`
    UPDATE wallets SET balance = CAST(CAST(balance AS DECIMAL(65,0)) AS CHAR)
  `);

  await knex.raw(`
    UPDATE ledger_entries SET amount = CAST(CAST(amount AS DECIMAL(65,0)) AS CHAR)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ledger_entries 
    MODIFY COLUMN amount decimal(20,4) NOT NULL
  `);

  await knex.raw(`
    ALTER TABLE wallets 
    MODIFY COLUMN balance decimal(20,4) NOT NULL DEFAULT '0.0000'
  `);
}
