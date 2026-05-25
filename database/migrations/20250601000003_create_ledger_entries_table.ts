import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ledger_entries', (table) => {
    table.string('id', 36).primary();
    table.string('wallet_id', 36).notNullable();
    table.specificType('amount', 'decimal(20,4)').notNullable();
    table.enu('type', ['DEBIT', 'CREDIT']).notNullable();
    table.string('description', 255).notNullable();
    table.datetime('created_at', { precision: 6 }).defaultTo(knex.raw('CURRENT_TIMESTAMP(6)')).notNullable();

    table
      .foreign('wallet_id')
      .references('id')
      .inTable('wallets')
      .onDelete('RESTRICT')
      .onUpdate('RESTRICT');
  });

  await knex.raw(`CREATE INDEX idx_ledger_entries_wallet_created ON ledger_entries (wallet_id, created_at)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ledger_entries');
}
