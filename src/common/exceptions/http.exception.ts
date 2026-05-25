import { ResponseStatus, ErrorCode } from '../enums';

export class HttpException extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly timestamp: Date;

  constructor(statusCode: number, errorCode: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.timestamp = new Date();
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  public toJSON(): object {
    return {
      status: ResponseStatus.ERROR,
      code: this.errorCode,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

export class BadRequestException extends HttpException {
  constructor(message: string, errorCode: string = 'BAD_REQUEST') {
    super(400, errorCode, message);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message: string, errorCode: string = 'FORBIDDEN') {
    super(403, errorCode, message);
  }
}

export class InsufficientFundsException extends HttpException {
  constructor(
    message: string = 'Insufficient funds for this transaction.',
    errorCode: string = ErrorCode.INSUFFICIENT_BALANCE
  ) {
    super(400, errorCode, message);
  }
}

export class ServiceUnavailableException extends HttpException {
  public readonly serviceName: string;
  public readonly retryAfterMs: number | null;

  constructor(
    message: string,
    serviceName: string,
    retryAfterMs: number | null = null,
    errorCode: string = 'SERVICE_UNAVAILABLE'
  ) {
    super(503, errorCode, message);
    this.serviceName = serviceName;
    this.retryAfterMs = retryAfterMs;
  }

  public override toJSON(): object {
    return super.toJSON();
  }
}