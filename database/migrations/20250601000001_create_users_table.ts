import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.string('id', 36).primary();
    table.string('email', 255).notNullable().unique();
    table.string('bvn', 11).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.datetime('created_at', { precision: 6 }).defaultTo(knex.raw('CURRENT_TIMESTAMP(6)')).notNullable();
    table.datetime('updated_at', { precision: 6 }).defaultTo(knex.raw('CURRENT_TIMESTAMP(6)')).notNullable();
  });

  await knex.raw(`CREATE INDEX idx_users_email ON users (email)`);
  await knex.raw(`CREATE INDEX idx_users_bvn ON users (bvn)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
