import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ForbiddenException } from '../exceptions/http.exception';
import { ErrorCode } from '../enums';
import { config } from '../../../config/environment';

export interface AuthenticatedUser {
  id: string;
  email: string;
  bvn: string;
  iat?: number;
  exp?: number;
}

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      startTime?: number;
    }
  }
}

interface JwtPayload {
  sub: string;
  email: string;
  bvn: string;
  iat?: number;
  exp?: number;
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return null;
  }

  const scheme = parts[0] ?? '';
  const token = parts[1] ?? '';

  if (scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  if (!token || token.trim().length === 0) {
    return null;
  }

  return token.trim();
}

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];

  const token = extractBearerToken(authHeader as string | undefined);

  if (!token) {
    throw new ForbiddenException(
      'Missing or malformed Authorization header. Expected format: Bearer <token>',
      ErrorCode.MISSING_AUTH_TOKEN
    );
  }

  try {
    const decodedRaw = jwt.verify(token, config.jwt.secret);

    if (!decodedRaw || typeof decodedRaw !== 'object') {
      throw new ForbiddenException(
        'Invalid token payload.',
        ErrorCode.INVALID_AUTH_TOKEN
      );
    }

    const decoded = decodedRaw as Partial<JwtPayload>;

    if (
      typeof decoded.sub !== 'string' ||
      decoded.sub.trim().length === 0 ||
      !UUID_REGEX.test(decoded.sub)
    ) {
      throw new ForbiddenException(
        'Token payload missing required claims.',
        ErrorCode.INVALID_AUTH_TOKEN
      );
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email ?? '',
      bvn: decoded.bvn ?? '',
      iat: decoded.iat,
      exp: decoded.exp,
    };

    next();
  } catch {
    throw new ForbiddenException(
      'Invalid or expired token. Please authenticate again.',
      ErrorCode.INVALID_AUTH_TOKEN
    );
  }
}
