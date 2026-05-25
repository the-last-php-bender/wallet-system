import type { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { HttpException } from '../exceptions/http.exception';
import { RepositoryException } from '../exceptions/repository.exception';
import { ResponseHelper } from '../response';
import { LogLevel, ExceptionType, ErrorCode, HttpStatus } from '../enums';
import { version } from '../../../package.json';
import { ServiceUnavailableException } from '../exceptions/http.exception';

const logger = pino({
  level: process.env.LOG_LEVEL ?? LogLevel.INFO,
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'wallet-engine',
    version,
  },
  serializers: {
    req: (req: pino.SerializedRequest) => ({
      method: req.method,
      url: req.url,
      headers: {
        'content-type': (req.headers as Record<string, string>)['content-type'],
        'user-agent': (req.headers as Record<string, string>)['user-agent'],
        'x-request-id': (req.headers as Record<string, string>)['x-request-id'],
      },
    }),
    res: (res: pino.SerializedResponse) => ({
      statusCode: res.statusCode,
      headers: {
        'content-type': (res.headers as Record<string, string>)['content-type'],
        'content-length': (res.headers as Record<string, string>)['content-length'],
      },
    }),
    err: pino.stdSerializers.err,
  },
});

export interface LogMetadata {
  requestId?: string;
  userId?: string;
  walletId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export class ErrorLogger {
  private static formatError(error: Error): object {
    if (error instanceof HttpException) {
      return {
        type: ExceptionType.DOMAIN_EXCEPTION,
        errorCode: error.errorCode,
        statusCode: error.statusCode,
        message: error.message,
        timestamp: error.timestamp.toISOString(),
        stack: error.stack,
      };
    }
    return {
      type: ExceptionType.NATIVE_EXCEPTION,
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  public static log(
    level: LogLevel,
    message: string,
    error: Error,
    metadata?: LogMetadata
  ): void {
    const logData = {
      ...metadata,
      error: this.formatError(error),
    };

    switch (level) {
      case LogLevel.FATAL:
        logger.fatal(logData, message);
        break;
      case LogLevel.ERROR:
        logger.error(logData, message);
        break;
      case LogLevel.WARN:
        logger.warn(logData, message);
        break;
      case LogLevel.INFO:
        logger.info(logData, message);
        break;
    }
  }
}

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req.headers as Record<string, string>)['x-request-id'] ?? 'unknown';
  const startTime = (req as Request & { startTime?: number }).startTime ?? Date.now();
  const durationMs = Date.now() - startTime;

  let statusCode: number;
  let errorCode: string;
  let message: string;
  let extraFields: Record<string, unknown> = {};

  if (err instanceof ServiceUnavailableException) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = 'Service temporarily unavailable. Please try again later.';
  } else if (err instanceof HttpException) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = err.message;

    if (statusCode >= 500) {
      ErrorLogger.log(LogLevel.ERROR, 'Domain exception caught in error handler', err, {
        requestId,
        userId: (req.user as { id?: string })?.id,
        durationMs,
      });
    } else {
      ErrorLogger.log(LogLevel.WARN, 'Client error caught in error handler', err, {
        requestId,
        userId: (req.user as { id?: string })?.id,
        durationMs,
      });
    }
  } else {
    statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    message = 'An unexpected internal server error occurred. Please try again later.';

    const knexError = err as { code?: string; sql?: string };
    if (knexError.code === 'ETIMEDOUT' || (err.message && err.message.includes('Timeout acquiring a connection'))) {
      statusCode = HttpStatus.SERVICE_UNAVAILABLE;
      errorCode = ErrorCode.SERVICE_UNAVAILABLE;
      message = 'The database is temporarily unavailable due to high load. Please retry your request.';
      extraFields.retryAfterMs = 1000;
    }

    ErrorLogger.log(LogLevel.FATAL, 'Unhandled native exception in error handler', err, {
      requestId,
      userId: (req.user as { id?: string })?.id,
      durationMs,
    });
  }

  if (!res.headersSent) {
    ResponseHelper.error(res, message, errorCode, statusCode, extraFields);
  }
}

export { logger };