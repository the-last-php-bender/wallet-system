import Joi from 'joi';

const walletIdSchema = Joi.string()
  .guid({ version: 'uuidv4' })
  .required()
  .messages({
    'string.guid': 'walletId must be a valid UUIDv4',
    'any.required': 'walletId is required',
  });

export const ledgerParamsSchema = Joi.object({
  walletId: walletIdSchema,
});

export const ledgerQuerySchema = Joi.object({
  limit: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(50)
    .messages({
      'number.base': 'limit must be a number',
      'number.integer': 'limit must be an integer',
      'number.min': 'limit must be at least 1',
      'number.max': 'limit must be at most 1000',
    }),
  offset: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .messages({
      'number.base': 'offset must be a number',
      'number.integer': 'offset must be an integer',
      'number.min': 'offset must be at least 0',
    }),
});
