import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ForbiddenException } from '../exceptions/http.exception';
import { ErrorCode } from '../enums';
import { config } from '../../../config/environment';
import type { AuthenticatedUser } from './auth.middleware';

export function refreshTokenMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ForbiddenException('Refresh token is required.', ErrorCode.MISSING_AUTH_TOKEN);
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret as string) as unknown as { sub: string; email: string; bvn: string };
    if (typeof decoded.sub !== 'string' || decoded.sub.trim().length === 0) {
      throw new ForbiddenException('Invalid or expired refresh token.', ErrorCode.INVALID_AUTH_TOKEN);
    }

    (req as Request & { user?: AuthenticatedUser }).user = {
      id: decoded.sub,
      email: decoded.email,
      bvn: decoded.bvn,
    };
    next();
  } catch {
    throw new ForbiddenException('Invalid or expired refresh token.', ErrorCode.INVALID_AUTH_TOKEN);
  }
}
