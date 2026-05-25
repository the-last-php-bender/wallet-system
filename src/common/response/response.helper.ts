import type { Response } from 'express';
import { ResponseStatus, HttpStatus } from '../enums';

export class ResponseHelper {
  static success<T>(res: Response, data: T, statusCode: number = HttpStatus.OK): void {
    const body = {
      status: ResponseStatus.SUCCESS,
      data,
    };
    res.locals.idempotencyCachedBody = body;
    res.status(statusCode).json(body);
  }

  static created<T>(res: Response, data: T): void {
    ResponseHelper.success(res, data, HttpStatus.CREATED);
  }

  static noContent(res: Response): void {
    res.status(HttpStatus.NO_CONTENT).end();
  }

  static error(
    res: Response,
    message: string,
    code: string,
    statusCode: number = HttpStatus.BAD_REQUEST,
    extra?: Record<string, unknown>
  ): void {
    const body: Record<string, unknown> = {
      status: ResponseStatus.ERROR,
      code,
      message,
    };

    if (extra) {
      Object.assign(body, extra);
    }

    res.locals.idempotencyCachedBody = body;
    res.status(statusCode).json(body);
  }

  static json<T>(res: Response, body: T, statusCode: number = HttpStatus.OK): void {
    res.locals.idempotencyCachedBody = body;
    res.status(statusCode).json(body);
  }
}
