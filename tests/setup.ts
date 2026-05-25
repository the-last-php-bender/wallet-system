jest.setTimeout(30000);

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.PORT = '0';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'wallet_user';
process.env.DB_PASSWORD = 'walletsecretpassword';
process.env.DB_NAME = 'wallet_engine';
process.env.ADJUTOR_APP_ID = 'test_app_id';
process.env.ADJUTOR_API_KEY = 'test_api_key';
process.env.ADJUTOR_BASE_URL = 'https://adjutor.lendsqr.com/v2';
process.env.ADJUTOR_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.CIRCUIT_BREAKER_TIMEOUT = '3000';
process.env.CIRCUIT_BREAKER_ERROR_PERCENTAGE_THRESHOLD = '50';
process.env.CIRCUIT_BREAKER_VOLUME_THRESHOLD = '5';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.PASSWORD_SALT_ROUNDS = '12';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

afterAll(async () => {
  jest.clearAllMocks();
  await new Promise((resolve) => setTimeout(resolve, 500));
});
