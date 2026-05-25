import Joi from 'joi';

const emailSchema = Joi.string()
  .trim()
  .lowercase()
  .max(255)
  .pattern(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/)
  .required()
  .messages({
    'string.email': 'Email must be a valid email address',
    'string.pattern.base': 'Email must be a valid lowercase email address',
    'string.max': 'Email must not exceed 255 characters',
    'any.required': 'Email is required',
  });

const bvnSchema = Joi.string()
  .trim()
  .length(11)
  .pattern(/^[0-9]{11}$/)
  .required()
  .messages({
    'string.length': 'BVN must be exactly 11 digits',
    'string.pattern.base': 'BVN must contain only numeric digits',
    'any.required': 'BVN is required',
  });

const passwordSchema = Joi.string()
  .trim()
  .min(8)
  .max(128)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must not exceed 128 characters',
    'any.required': 'Password is required',
  });

export const registerUserSchema = Joi.object({
  email: emailSchema,
  bvn: bvnSchema,
  password: passwordSchema,
  firstName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name must not exceed 100 characters',
      'any.required': 'First name is required',
    }),
  lastName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name must not exceed 100 characters',
      'any.required': 'Last name is required',
    }),
  dateOfBirth: Joi.string()
    .trim()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'Date of birth must be in YYYY-MM-DD format',
      'any.required': 'Date of birth is required',
    }),
  phoneNumber: Joi.string()
    .trim()
    .pattern(/^[0-9]{11}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Phone number must be 11 digits',
    }),
});

export const authenticateUserSchema = Joi.object({
  email: emailSchema,
  password: passwordSchema,
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .trim()
    .required()
    .messages({
      'any.required': 'refreshToken is required',
      'string.base': 'refreshToken must be a string',
    }),
});

export const userIdParamSchema = Joi.object({
  userId: Joi.string()
    .guid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'User ID must be a valid UUIDv4',
      'any.required': 'User ID is required',
    }),
});
