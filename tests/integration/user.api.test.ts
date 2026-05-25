import request from 'supertest';
import { type Express } from 'express';
import { createApplication } from '../../src/app';
import db from '../../config/database';
import { blacklistModule } from '../../src/modules/blacklist/blacklist.module';


const mockUserRepoInstance = {
  findByEmail: jest.fn(),
  findByBvn: jest.fn(),
  createUser: jest.fn(),
  findById: jest.fn(),
  emailExists: jest.fn(),
  bvnExists: jest.fn(),
  updatePassword: jest.fn(),
  verifyPassword: jest.fn(),
  countUsers: jest.fn(),
};

const mockWalletRepoInstance = {
  findByUserIdForUpdate: jest.fn(),
  findByUserId: jest.fn(),
  findByWalletId: jest.fn(),
  updateBalance: jest.fn(),
  createWallet: jest.fn(),
  incrementBalance: jest.fn(),
  decrementBalance: jest.fn(),
  validateBalance: jest.fn(),
  lockAndValidateBalance: jest.fn(),
};

jest.mock('../../config/database', () => {
  const mockTrx = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };
  return {
    __esModule: true,
    default: {
      transaction: jest.fn((callback: (trx: unknown) => Promise<unknown>) => callback(mockTrx)),
      raw: jest.fn().mockResolvedValue({ rows: [{ '1': 1 }] }),
      destroy: jest.fn().mockResolvedValue(undefined),
    },
  };
});

jest.mock('../../src/modules/blacklist/blacklist.module', () => {
  const actual = jest.requireActual('../../src/modules/blacklist/blacklist.module');
  return {
    ...actual,
    blacklistModule: {
      ...actual.blacklistModule,
      verify: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue({
        healthy: true,
        breakerState: 'CLOSED',
        cacheSize: 0,
      }),
      getCacheSize: jest.fn().mockReturnValue(0),
      clearCache: jest.fn(),
      isBreakerOpen: jest.fn().mockReturnValue(false),
      getBreakerStats: jest.fn().mockReturnValue(null),
    },
    BlacklistModule: actual.BlacklistModule,
  };
});

jest.mock('../../src/modules/user/user.repository', () => ({
  UserRepository: jest.fn(() => mockUserRepoInstance),
}));

jest.mock('../../src/modules/wallet/wallet.repository', () => ({
  WalletRepository: jest.fn(() => mockWalletRepoInstance),
}));

describe('User Registration API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    const application = createApplication();
    app = application.getApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    try {
      const actual = jest.requireActual('../../src/modules/blacklist/blacklist.module');
      await actual.blacklistModule.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    try {
      await db.destroy();
    } catch {
      // Ignore cleanup errors in tests
    }
  });

  describe('POST /api/v1/users/register', () => {
    const validUserPayload = {
      email: 'testuser@example.com',
      bvn: '12345678901',
      password: 'SecurePassword123!',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      phoneNumber: '08012345678',
    };

    describe('Successful Registration', () => {
      it('should register a clean (non-blacklisted) user successfully', async () => {
        (blacklistModule.verify as jest.Mock).mockResolvedValue({
          isBlacklisted: false,
          isVerified: false,
          bvn: '12345678901',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          phoneNumber: '08012345678',
          watchList: false,
          fraudSuspected: false,
          responseMessage: 'Verification complete',
        });

        mockUserRepoInstance.findByEmail.mockResolvedValue(null);
        mockUserRepoInstance.findByBvn.mockResolvedValue(null);
        mockUserRepoInstance.createUser.mockResolvedValue({
          id: 1,
          email: 'testuser@example.com',
          bvn: '12345678901',
          password_hash: '$2b$12$hashedpassword',
          created_at: new Date(),
          updated_at: new Date(),
        });
        mockWalletRepoInstance.createWallet.mockResolvedValue({
          id: 1,
          user_id: 1,
          balance: '0.0000',
          created_at: new Date(),
          updated_at: new Date(),
        });

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(validUserPayload);

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('success');
        expect(response.body.data).toHaveProperty('userId');
        expect(response.body.data).toHaveProperty('walletId');
        expect(response.body.data.email).toBe('testuser@example.com');
      });

      it('should return validation error when email is missing', async () => {
        const invalidPayload = { ...validUserPayload };
        delete (invalidPayload as Record<string, unknown>).email;

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(invalidPayload);

        expect(response.status).toBe(500);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('INVALID_INPUT');
      });

      it('should return validation error when BVN is invalid format (not 11 digits)', async () => {
        const invalidPayload = { ...validUserPayload, bvn: '12345' };

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(invalidPayload);

        expect(response.status).toBe(500);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('INVALID_INPUT');
      });

      it('should return validation error when password is too short', async () => {
        const invalidPayload = { ...validUserPayload, password: 'short' };

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(invalidPayload);

        expect(response.status).toBe(500);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('INVALID_INPUT');
      });

      it('should return validation error when firstName is missing', async () => {
        const invalidPayload = { ...validUserPayload };
        delete (invalidPayload as Record<string, unknown>).firstName;

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(invalidPayload);

        expect(response.status).toBe(500);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('INVALID_INPUT');
      });

      it('should return validation error when dateOfBirth is missing', async () => {
        const invalidPayload = { ...validUserPayload };
        delete (invalidPayload as Record<string, unknown>).dateOfBirth;

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(invalidPayload);

        expect(response.status).toBe(500);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('INVALID_INPUT');
      });
    });

    describe('Blacklist Blocking', () => {
      beforeEach(() => {
        mockUserRepoInstance.findByEmail.mockResolvedValue(null);
        mockUserRepoInstance.findByBvn.mockResolvedValue(null);
        mockUserRepoInstance.createUser.mockResolvedValue({
          id: 1,
          email: 'testuser@example.com',
          bvn: '12345678901',
          password_hash: '$2b$12$hashedpassword',
          created_at: new Date(),
          updated_at: new Date(),
        });
        mockWalletRepoInstance.createWallet.mockResolvedValue({
          id: 1,
          user_id: 1,
          balance: '0.0000',
          created_at: new Date(),
          updated_at: new Date(),
        });
      });

      it('should block registration for blacklisted users (watch_list=true)', async () => {
        (blacklistModule.verify as jest.Mock).mockResolvedValue({
          isBlacklisted: true,
          isVerified: false,
          bvn: '12345678901',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          phoneNumber: '08012345678',
          watchList: true,
          fraudSuspected: false,
          responseMessage: 'User found on watch list',
        });

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(validUserPayload);

        expect(response.status).toBe(403);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('USER_BLACKLISTED');
        expect(response.body.message).toContain('compliance');
      });

      it('should block registration for blacklisted users (fraud_suspected=true)', async () => {
        (blacklistModule.verify as jest.Mock).mockResolvedValue({
          isBlacklisted: true,
          isVerified: false,
          bvn: '12345678901',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          phoneNumber: '08012345678',
          watchList: false,
          fraudSuspected: true,
          responseMessage: 'User flagged for suspected fraud',
        });

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(validUserPayload);

        expect(response.status).toBe(403);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('USER_BLACKLISTED');
      });

      it('should block registration when both watch_list and fraud_suspected are true', async () => {
        (blacklistModule.verify as jest.Mock).mockResolvedValue({
          isBlacklisted: true,
          isVerified: false,
          bvn: '12345678901',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          phoneNumber: '08012345678',
          watchList: true,
          fraudSuspected: true,
          responseMessage: 'High risk user detected',
        });

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(validUserPayload);

        expect(response.status).toBe(403);
        expect(response.body.status).toBe('error');
      });

      it('should return 503 when identity verification service is unavailable', async () => {
        const ServiceUnavailableException = jest.requireActual('../../src/common/exceptions/http.exception').ServiceUnavailableException;
        (blacklistModule.verify as jest.Mock).mockRejectedValue(
          new ServiceUnavailableException(
            'Identity verification service is temporarily unavailable',
            'AdjutorKarmaAPI',
            60000
          )
        );

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(validUserPayload);

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
      });

      it('should block blacklisted users even when all other fields are valid', async () => {
        (blacklistModule.verify as jest.Mock).mockResolvedValue({
          isBlacklisted: true,
          isVerified: false,
          bvn: '12345678901',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          phoneNumber: '08012345678',
          watchList: true,
          fraudSuspected: false,
          responseMessage: 'User found on watch list',
        });

        const response = await request(app)
          .post('/api/v1/users/register')
          .set('Content-Type', 'application/json')
          .send(validUserPayload);

        expect(response.status).toBe(403);
        expect(response.body.code).toBe('USER_BLACKLISTED');
      });
    });

    describe('Authentication', () => {
      it('should return 401 for invalid credentials', async () => {
        mockUserRepoInstance.findByEmail.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/v1/users/authenticate')
          .set('Content-Type', 'application/json')
          .send({
            email: 'nonexistent@example.com',
            password: 'wrongpassword',
          });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_CREDENTIALS');
      });

      it('should return validation error when email is missing for authentication', async () => {
        const response = await request(app)
          .post('/api/v1/users/authenticate')
          .set('Content-Type', 'application/json')
          .send({
            password: 'somepassword',
          });

        expect(response.status).toBe(500);
        expect(response.body.code).toBe('INVALID_INPUT');
      });
    });
  });

  describe('Health Check Endpoints', () => {
    it('should return 200 for GET /health', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 200 for GET /ready', async () => {
      const response = await request(app).get('/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('blacklistService');
    });
  });

  describe('Route Not Found', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/v1/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ROUTE_NOT_FOUND');
    });
  });
});


