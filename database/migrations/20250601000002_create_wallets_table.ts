import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('wallets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('user_id').notNullable().unique();
    table.specificType('balance', 'decimal(20,4)').defaultTo('0.0000').notNullable();
    table.datetime('created_at', { precision: 6 }).defaultTo(knex.raw('CURRENT_TIMESTAMP(6)')).notNullable();
    table.datetime('updated_at', { precision: 6 }).defaultTo(knex.raw('CURRENT_TIMESTAMP(6)')).notNullable();

    table
      .foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .onUpdate('RESTRICT');
  });

  await knex.raw(`CREATE INDEX idx_wallets_user_id ON wallets (user_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('wallets');
}
