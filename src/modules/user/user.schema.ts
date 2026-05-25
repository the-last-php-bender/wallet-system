import Joi from 'joi';

/**
 * BVN validation: 11-digit Nigerian Bank Verification Number
 */
const bvnSchema = Joi.string()
  .length(11)
  .pattern(/^[0-9]{11}$/)
  .required()
  .messages({
    'string.length': 'BVN must be exactly 11 digits',
    'string.pattern.base': 'BVN must contain only numeric digits',
    'any.required': 'BVN is required',
  });

/**
 * Email validation with proper format
 */
const emailSchema = Joi.string()
  .email()
  .max(255)
  .lowercase()
  .trim()
  .required()
  .messages({
    'string.email': 'Email must be a valid email address',
    'string.max': 'Email must not exceed 255 characters',
    'any.required': 'Email is required',
  });

/**
 * Password validation: minimum 8 characters
 */
const passwordSchema = Joi.string()
  .min(8)
  .max(255)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must not exceed 255 characters',
    'any.required': 'Password is required',
  });

/**
 * User registration request schema
 */
export const registerUserSchema = Joi.object({
  email: emailSchema,
  bvn: bvnSchema,
  password: passwordSchema,
  firstName: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .required()
    .messages({
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name must not exceed 100 characters',
      'any.required': 'First name is required',
    }),
  lastName: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .required()
    .messages({
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name must not exceed 100 characters',
      'any.required': 'Last name is required',
    }),
  dateOfBirth: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'Date of birth must be in YYYY-MM-DD format',
      'any.required': 'Date of birth is required',
    }),
  phoneNumber: Joi.string()
    .pattern(/^[0-9]{11}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be 11 digits',
      'any.required': 'Phone number is required',
    }),
});

/**
 * User authentication request schema
 */
export const authenticateUserSchema = Joi.object({
  email: emailSchema,
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required',
    }),
});

/**
 * User ID parameter validation schema
 */
export const userIdParamSchema = Joi.object({
  userId: Joi.string()
    .guid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.base': 'User ID must be a string',
      'string.guid': 'User ID must be a valid UUID',
      'any.required': 'User ID is required',
    }),
});
