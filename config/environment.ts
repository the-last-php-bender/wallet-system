import dotenv from 'dotenv';

dotenv.config();

interface EnvironmentConfig {
  PORT: number;
  NODE_ENV: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  ADJUTOR_APP_ID?: string;
  ADJUTOR_API_KEY?: string;
  ADJUTOR_BASE_URL?: string;
  ADJUTOR_WEBHOOK_SECRET?: string;
  LOG_LEVEL: string;
  ALLOWED_ORIGINS?: string;
  PASSWORD_SALT_ROUNDS: number;
  CIRCUIT_BREAKER_TIMEOUT: number;
  CIRCUIT_BREAKER_ERROR_PERCENTAGE_THRESHOLD: number;
  CIRCUIT_BREAKER_VOLUME_THRESHOLD: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_SECRET?: string;
  JWT_REFRESH_EXPIRES_IN: string;
  VAULT_ADDR?: string;
  VAULT_TOKEN?: string;
}

function parseInteger(value: string | undefined, name: string): number {
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is required but was not defined.`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer, received: "${value}".`);
  }
  return parsed;
}

function load(): EnvironmentConfig {
  const PORT = parseInteger(process.env.PORT, 'PORT');
  const NODE_ENV = process.env.NODE_ENV ?? 'development';
  const DB_HOST = process.env.DB_HOST ?? 'localhost';
  const DB_PORT = parseInteger(process.env.DB_PORT ?? '3306', 'DB_PORT');
  const DB_USER = process.env.DB_USER;
  if (!DB_USER) {
    throw new Error('Environment variable DB_USER is required but was not defined.');
  }
  const DB_PASSWORD = process.env.DB_PASSWORD;
  if (!DB_PASSWORD) {
    throw new Error('Environment variable DB_PASSWORD is required but was not defined.');
  }
  const DB_NAME = process.env.DB_NAME;
  if (!DB_NAME) {
    throw new Error('Environment variable DB_NAME is required but was not defined.');
  }
    const PASSWORD_SALT_ROUNDS = parseInteger(process.env.PASSWORD_SALT_ROUNDS ?? '12', 'PASSWORD_SALT_ROUNDS');
  const ADJUTOR_APP_ID = process.env.ADJUTOR_APP_ID;
  const ADJUTOR_API_KEY = process.env.ADJUTOR_API_KEY;
  const ADJUTOR_BASE_URL = process.env.ADJUTOR_BASE_URL ?? 'https://adjutor.lendsqr.com/v2';
  const ADJUTOR_WEBHOOK_SECRET = process.env.ADJUTOR_WEBHOOK_SECRET;
  const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;
  const CIRCUIT_BREAKER_TIMEOUT = parseInteger(process.env.CIRCUIT_BREAKER_TIMEOUT ?? '60000', 'CIRCUIT_BREAKER_TIMEOUT');
  const CIRCUIT_BREAKER_ERROR_PERCENTAGE_THRESHOLD = parseInteger(process.env.CIRCUIT_BREAKER_ERROR_PERCENTAGE_THRESHOLD ?? '50', 'CIRCUIT_BREAKER_ERROR_PERCENTAGE_THRESHOLD');
  const CIRCUIT_BREAKER_VOLUME_THRESHOLD = parseInteger(process.env.CIRCUIT_BREAKER_VOLUME_THRESHOLD ?? '10', 'CIRCUIT_BREAKER_VOLUME_THRESHOLD');
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    throw new Error('Environment variable JWT_SECRET is required but was not defined.');
  }
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
  const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
  const VAULT_ADDR = process.env.VAULT_ADDR;
  const VAULT_TOKEN = process.env.VAULT_TOKEN;

  return {
    PORT,
    NODE_ENV,
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    ADJUTOR_APP_ID,
    ADJUTOR_API_KEY,
    ADJUTOR_BASE_URL,
    ADJUTOR_WEBHOOK_SECRET,
    LOG_LEVEL,
    ALLOWED_ORIGINS,
    CIRCUIT_BREAKER_TIMEOUT,
    CIRCUIT_BREAKER_ERROR_PERCENTAGE_THRESHOLD,
    CIRCUIT_BREAKER_VOLUME_THRESHOLD,
      PASSWORD_SALT_ROUNDS,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    JWT_REFRESH_SECRET,
    JWT_REFRESH_EXPIRES_IN,
    VAULT_ADDR,
    VAULT_TOKEN,
  };
 
}

const env = load();

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  } as { host: string; port: number; database: string; user: string; password: string },
  adjutor: {
    appId: env.ADJUTOR_APP_ID,
    apiKey: env.ADJUTOR_API_KEY,
    baseUrl: env.ADJUTOR_BASE_URL,
    webhookSecret: env.ADJUTOR_WEBHOOK_SECRET,
  },
  cors: {
    allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : ['http://localhost:3000', 'http://localhost:8080'],
  },
  log: {
    level: env.LOG_LEVEL,
  },
  circuitBreaker: {
    timeout: env.CIRCUIT_BREAKER_TIMEOUT,
    errorPercentageThreshold: env.CIRCUIT_BREAKER_ERROR_PERCENTAGE_THRESHOLD,
    volumeThreshold: env.CIRCUIT_BREAKER_VOLUME_THRESHOLD,
  },
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET ?? env.JWT_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  security: {
    passwordSaltRounds: env.PASSWORD_SALT_ROUNDS,
  },
  secrets: {
    vaultAddr: env.VAULT_ADDR,
    vaultToken: env.VAULT_TOKEN,
  },
};

export type Config = typeof config;
