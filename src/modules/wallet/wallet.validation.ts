import Joi from 'joi';

const uuidSchema = Joi.string()
  .guid({ version: 'uuidv4' })
  .required()
  .messages({
    'string.guid': 'Identifier must be a valid UUIDv4',
    'any.required': 'Identifier is required',
  });

const amountSchema = Joi.string()
  .pattern(/^\d+$/)
  .custom((value, helpers) => {
    try {
      const numericValue = BigInt(value);
      if (numericValue <= 0n) {
        return helpers.error('any.invalid');
      }
      return value;
    } catch {
      return helpers.error('any.invalid');
    }
  })
  .required()
  .messages({
    'string.pattern.base': 'Amount must be a whole number in kobo',
    'any.invalid': 'Amount must be a positive integer greater than zero',
    'any.required': 'Amount is required',
  });

export const fundWalletSchema = Joi.object({
  amount: amountSchema,
});

export const transferWalletSchema = Joi.object({
  receiverUserId: uuidSchema,
  amount: amountSchema,
});

export const withdrawWalletSchema = Joi.object({
  amount: amountSchema,
});

export const walletIdParamSchema = Joi.object({
  walletId: uuidSchema,
});
