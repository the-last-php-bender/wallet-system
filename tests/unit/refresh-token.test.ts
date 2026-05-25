import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { refreshTokenMiddleware } from '../../src/common/guards/refresh.middleware';
import { UserController } from '../../src/modules/user/user.controller';
import { UserService } from '../../src/modules/user/user.service';
import { ResponseHelper } from '../../src/common/response';
import { ForbiddenException } from '../../src/common/exceptions/http.exception';
import { ErrorCode, HttpStatus } from '../../src/common/enums';

jest.mock('jsonwebtoken');

function createMockReqRes(): { req: Partial<Request>; res: Partial<Response>; next: jest.Mock } {
  const req: Partial<Request> = {
    headers: {},
    body: {},
  };
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('refreshTokenMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should attach user to request and call next() when token is valid', () => {
    const { req, res, next } = createMockReqRes();
    req.headers = { authorization: 'Bearer valid-refresh-token' };

    (jwt.verify as jest.Mock).mockReturnValue({
      sub: '42',
      email: 'user@test.com',
      bvn: '12345678901',
    });

    refreshTokenMiddleware(req as Request, res as Response, next as NextFunction);

    expect(jwt.verify).toHaveBeenCalledWith('valid-refresh-token', 'test-jwt-refresh-secret');
    expect((req as any).user).toEqual({
      id: '42',
      email: 'user@test.com',
      bvn: '12345678901',
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should throw ForbiddenException when Authorization header is missing', () => {
    const { req, res, next } = createMockReqRes();
    req.headers = {};

    expect(() => refreshTokenMiddleware(req as Request, res as Response, next as NextFunction))
      .toThrow(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenException when Authorization header does not start with Bearer', () => {
    const { req, res, next } = createMockReqRes();
    req.headers = { authorization: 'Basic token123' };

    expect(() => refreshTokenMiddleware(req as Request, res as Response, next as NextFunction))
      .toThrow('Refresh token is required.');
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenException when token verification fails', () => {
    const { req, res, next } = createMockReqRes();
    req.headers = { authorization: 'Bearer invalid-token' };

    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    expect(() => refreshTokenMiddleware(req as Request, res as Response, next as NextFunction))
      .toThrow(ForbiddenException);
    expect(() => refreshTokenMiddleware(req as Request, res as Response, next as NextFunction))
      .toThrow('Invalid or expired refresh token.');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('UserController.refreshToken', () => {
  let controller: UserController;
  let mockUserService: Partial<UserService>;

  beforeAll(() => {
    mockUserService = {};
    controller = new UserController(mockUserService as UserService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return new tokens when refreshToken is valid', async () => {
    const { req, res, next } = createMockReqRes();
    req.body = { refreshToken: 'old-refresh-token' };

    (jwt.verify as jest.Mock).mockReturnValue({
      sub: '1',
    });

    (jwt.sign as jest.Mock)
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token');

    jest.spyOn(ResponseHelper, 'success').mockImplementation(() => {});

    await controller.refreshToken(req as Request, res as Response, next as NextFunction);

    expect(jwt.verify).toHaveBeenCalledWith('old-refresh-token', 'test-jwt-refresh-secret');

    expect(jwt.sign).toHaveBeenNthCalledWith(
      1,
      { sub: '1' },
      'test-jwt-secret',
      { expiresIn: '15m' },
    );

    expect(jwt.sign).toHaveBeenNthCalledWith(
      2,
      { sub: '1' },
      'test-jwt-refresh-secret',
      { expiresIn: '7d' },
    );

    expect(ResponseHelper.success).toHaveBeenCalledWith(res, {
      userId: '1',
      email: '',
      token: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenException when refreshToken is missing from body', async () => {
    const { req, res, next } = createMockReqRes();
    req.body = {};

    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('jwt must be a string');
    });

    await controller.refreshToken(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toContain('Invalid or expired refresh token');
  });

  it('should throw ForbiddenException when refreshToken is not a string', async () => {
    const { req, res, next } = createMockReqRes();
    req.body = { refreshToken: 12345 };

    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('jwt must be a string');
    });

    await controller.refreshToken(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toContain('Invalid or expired refresh token');
  });

  it('should throw ForbiddenException when jwt.verify fails', async () => {
    const { req, res, next } = createMockReqRes();
    req.body = { refreshToken: 'expired-refresh-token' };

    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('jwt expired');
    });

    await controller.refreshToken(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toContain('Invalid or expired refresh token');
  });

  it('should pass through ForbiddenException without wrapping', async () => {
    const { req, res, next } = createMockReqRes();
    req.body = { refreshToken: 'throw-forbidden' };

    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new ForbiddenException('Custom forbidden', ErrorCode.INVALID_AUTH_TOKEN);
    });

    await controller.refreshToken(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toBe('Custom forbidden');
  });
});
