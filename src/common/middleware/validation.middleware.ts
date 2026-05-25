import type { Request, Response, NextFunction } from 'express';
import type { Schema } from 'joi';
import { RepositoryException } from '../exceptions/repository.exception';
import { ErrorCode } from '../enums';

export const validateRequest = (
  schema: Schema,
  property: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const request = req as unknown as Record<string, unknown>;
    const { error, value } = schema.validate(request[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((detail) => detail.message).join(', ');
      throw new RepositoryException('Validation failed.', details, ErrorCode.INVALID_INPUT);
    }

    request[property] = value;
    next();
  };
};

export const validateBody = (schema: Schema) => validateRequest(schema, 'body');
export const validateQuery = (schema: Schema) => validateRequest(schema, 'query');
export const validateParams = (schema: Schema) => validateRequest(schema, 'params');
