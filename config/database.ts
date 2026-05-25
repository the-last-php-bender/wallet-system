import type { Knex } from 'knex';
import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';

const databaseHost = process.env.DB_HOST ?? 'localhost';
const databasePort = parseInt(process.env.DB_PORT ?? '3306', 10);
const databaseName = process.env.DB_NAME ?? 'wallet_engine';
const databaseUser = process.env.DB_USER ?? 'wallet_user';
const databasePassword = process.env.DB_PASSWORD ?? 'walletsecretpassword';

const DB_POOL_MIN = parseInt(process.env.DB_POOL_MIN ?? '2', 10);
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX ?? '50', 10);

const knexConfig: Knex.Config = {
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
    min: DB_POOL_MIN,
    max: DB_POOL_MAX,
    acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT ?? '5000', 10),
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    propagateCreateError: true,
    afterCreate: (connection: unknown, callback: (err: Error | null, connection: unknown) => void): void => {
      const conn = connection as {
        query?: (sql: string, cb: (err: Error | null) => void) => void;
        execute?: (sql: string, cb: (err: Error | null) => void) => void;
      };
      let pending = 4;
      let hadError = false;
      const done = (err?: Error | null): void => {
        if (hadError) return;
        if (err) { hadError = true; callback(err, connection); return; }
        pending--;
        if (pending === 0) callback(null, connection);
      };
      const run = (sql: string): void => {
        if (conn.query) conn.query(sql, done);
        else if (conn.execute) conn.execute(sql, done);
        else done();
      };
      run("SET time_zone = '+00:00'");
      run("SET NAMES utf8mb4");
      run("SET SESSION lock_wait_timeout = 5");
      run("SET SESSION max_execution_time = 15000");
    },
    validate: (connection: unknown): boolean => {
      const conn = connection as { _closing?: boolean; stream?: { destroyed?: boolean } };
      if (conn._closing || (conn.stream && conn.stream.destroyed)) {
        return false;
      }
      return true;
    },
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: nodeEnv === 'production' ? './dist/database/migrations' : './database/migrations',
    extension: nodeEnv === 'production' ? 'js' : 'ts',
    loadExtensions: nodeEnv === 'production' ? ['.js'] : ['.ts'],
  },
  seeds: {
    directory: './database/seeds',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
  debug: nodeEnv === 'development',
  asyncStackTraces: nodeEnv === 'development',
};

let db: Knex | null = null;

export function getDatabaseConnection(): Knex {
  if (db !== null) {
    return db;
  }
  db = knex(knexConfig);
  return db;
}

export default getDatabaseConnection();
