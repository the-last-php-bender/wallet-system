import Joi from 'joi';

const amountSchema = Joi.string()
  .pattern(/^\d+$/)
  .custom((value, helpers) => {
    try {
      const num = BigInt(value);
      if (num < 100n) {
        return helpers.error('any.min');
      }
      if (num > 999999999999999999n) {
        return helpers.error('any.invalid');
      }
    } catch {
      return helpers.error('any.invalid');
    }
    return value;
  })
  .required()
  .messages({
    'string.pattern.base': 'Amount must be a positive integer (in kobo)',
    'any.invalid': 'Amount must be a positive integer (in kobo)',
    'any.min': 'Amount must be at least 100 kobo (₦1.00)',
    'any.required': 'Amount is required',
  });

/**
 * User ID validation: positive integer
 */
const userIdSchema = Joi.string()
  .guid({ version: 'uuidv4' })
  .required()
  .messages({
    'string.base': 'User ID must be a string',
    'string.guid': 'User ID must be a valid UUID',
    'any.required': 'User ID is required',
  });

/**
 * Wallet ID validation: positive integer
 */
const walletIdSchema = Joi.number()
  .integer()
  .positive()
  .required()
  .messages({
    'number.base': 'Wallet ID must be a number',
    'number.integer': 'Wallet ID must be an integer',
    'number.positive': 'Wallet ID must be a positive number',
    'any.required': 'Wallet ID is required',
  });

/**
 * Wallet fund request schema
 */
export const fundWalletSchema = Joi.object({
  amount: amountSchema,
});

/**
 * Wallet transfer request schema
 */
export const transferWalletSchema = Joi.object({
  receiverUserId: userIdSchema,
  amount: amountSchema,
});

/**
 * Wallet withdrawal request schema
 */
export const withdrawWalletSchema = Joi.object({
  amount: amountSchema,
});

/**
 * Wallet balance inquiry parameter schema
 */
export const walletBalanceParamSchema = Joi.object({
  userId: userIdSchema,
});

/**
 * Wallet reconciliation parameter schema
 */
export const walletReconcileParamSchema = Joi.object({
  walletId: walletIdSchema,
});

/**
 * Transaction reference validation (optional, for query params)
 */
export const transactionRefSchema = Joi.object({
  transactionRef: Joi.string()
    .pattern(/^[A-Z]{3}-\d{13}-[A-Z0-9]{8}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Transaction reference must match format: XXX-XXXXXXXXXXXXX-XXXXXXXX',
    }),
});
