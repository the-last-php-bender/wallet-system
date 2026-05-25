import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.string('idempotency_key', 255).notNullable().unique();
    table.integer('status_code').nullable();
    table.json('response_body').nullable();
    table.datetime('created_at', { precision: 6 }).defaultTo(knex.raw('CURRENT_TIMESTAMP(6)')).notNullable();
    table.datetime('completed_at', { precision: 6 }).nullable();
  });

  await knex.raw(`CREATE INDEX idx_idempotency_keys_key ON idempotency_keys (idempotency_key)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('idempotency_keys');
}
