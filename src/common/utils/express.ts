import type { Request } from 'express';
import { BadRequestException } from '../exceptions/http.exception';
import { ErrorCode } from '../enums';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function getAuthenticatedUserId(req: Request): string {
  const userId = req.user?.id;

  if (typeof userId !== 'string' || userId.trim().length === 0 || !UUID_REGEX.test(userId)) {
    throw new BadRequestException('User ID not found in request context.', ErrorCode.USER_ID_MISSING);
  }

  return userId;
}
