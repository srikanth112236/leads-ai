import rateLimit from 'express-rate-limit';

export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many webhook requests', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});
