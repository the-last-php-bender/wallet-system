import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { BadRequestException } from '../exceptions/http.exception';
import { ValidationTarget } from '../enums';

type RequestTarget = 'body' | 'query' | 'params';

export interface ValidationOptions {
  abortEarly?: boolean;
  stripUnknown?: boolean;
  allowUnknown?: boolean;
}

export interface ValidationResult<T = unknown> {
  value: T;
  error?: Error;
}

export function validate(schema: Joi.ObjectSchema, target: ValidationTarget = ValidationTarget.BODY, options: ValidationOptions = {}) {
  const defaultOptions: ValidationOptions = {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
    ...options,
  };

  return (req: Request, _res: Response, next: NextFunction): void => {
    const targetKey = target as RequestTarget;
    const dataToValidate = req[targetKey];

    const { error, value } = schema.validate(dataToValidate, defaultOptions);

    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message)
        .join('; ');

      const firstError = error.details[0];
      const errorCode = firstError?.context?.key 
        ? `${firstError.context.key.toUpperCase()}_INVALID` 
        : 'VALIDATION_ERROR';

      throw new BadRequestException(
        `Validation failed: ${errorMessage}`,
        errorCode
      );
    }

    // Replace the original data with validated and sanitized data
    req[targetKey] = value;
    next();
  };
}

export function validateBody(schema: Joi.ObjectSchema, options?: ValidationOptions) {
  return validate(schema, ValidationTarget.BODY, options);
}

export function validateQuery(schema: Joi.ObjectSchema, options?: ValidationOptions) {
  return validate(schema, ValidationTarget.QUERY, options);
}

export function validateParams(schema: Joi.ObjectSchema, options?: ValidationOptions) {
  return validate(schema, ValidationTarget.PARAMS, options);
}
