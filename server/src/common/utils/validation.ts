import Joi from 'joi';

export const phoneSchema = Joi.string()
  .pattern(/^\+?[1-9]\d{6,14}$/)
  .required()
  .messages({ 'string.pattern.base': 'Phone must be in E.164 format' });

export const emailSchema = Joi.string()
  .email({ minDomainSegments: 2 })
  .required();

export const normalizePhone = (phone: string): string => {
  return phone.replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
};

export const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

export const normalizeString = (str: string): string => {
  return str.trim().toLowerCase();
};
