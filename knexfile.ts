import type { Knex } from 'knex';
import dotenv from 'dotenv';

dotenv.config();

interface KnexConfig {
  development: Knex.Config;
  test: Knex.Config;
  staging: Knex.Config;
  production: Knex.Config;
}

const databaseHost = process.env.DB_HOST ?? 'localhost';
const databasePort = parseInt(process.env.DB_PORT ?? '3306', 10);
const databaseName = process.env.DB_NAME ?? 'wallet_engine';
const databaseUser = process.env.DB_USER ?? 'wallet_user';
const databasePassword = process.env.DB_PASSWORD ?? 'walletsecretpassword';

const knexConfig: KnexConfig = {
  development: {
    client: 'mysql2',
    connection: {
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: databaseUser,
      password: databasePassword,
      charset: 'utf8mb4',
      connectTimeout: 5000,
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      propagateCreateError: false,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './database/migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: './database/seeds',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    debug: false,
    asyncStackTraces: process.env.NODE_ENV === 'development',
  },

  test: {
    client: 'mysql2',
    connection: {
      host: 'localhost',
      port: 3306,
      database: `${databaseName}_test`,
      user: databaseUser,
      password: databasePassword,
      charset: 'utf8mb4',
      connectTimeout: 3000,
    },
    pool: {
      min: 0,
      max: 5,
      acquireTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      reapIntervalMillis: 1000,
      propagateCreateError: false,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './database/migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    debug: false,
  },

  staging: {
    client: 'mysql2',
    connection: {
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: databaseUser,
      password: databasePassword,
      charset: 'utf8mb4',
      connectTimeout: 5000,
    },
    pool: {
      min: 5,
      max: 20,
      acquireTimeoutMillis: 15000,
      createTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      propagateCreateError: false,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './database/migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    debug: false,
  },

  production: {
    client: 'mysql2',
    connection: {
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: databaseUser,
      password: databasePassword,
      charset: 'utf8mb4',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectTimeout: 5000,
    },
    pool: {
      min: 10,
      max: 30,
      acquireTimeoutMillis: 20000,
      createTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      propagateCreateError: false,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './dist/database/migrations',
      extension: 'js',
      loadExtensions: ['.js'],
    },
    debug: false,
    asyncStackTraces: false,
  },
};

export default knexConfig;

export function getDatabaseConfig(): { host: string; port: number; name: string; user: string } {
  return {
    host: databaseHost,
    port: databasePort,
    name: databaseName,
    user: databaseUser,
  };
}
