import { Response } from 'express';
import { logger } from '../utils/logger';

export abstract class BaseController {
  protected sendSuccess(res: Response, data: unknown, message?: string, statusCode = 200): void {
    res.status(statusCode).json({
      success: true,
      message: message || 'Success',
      data,
    });
  }

  protected sendError(res: Response, message: string, statusCode = 400, code?: string, details?: unknown): void {
    logger.error(message, { code, details });
    res.status(statusCode).json({
      success: false,
      message,
      code: code || 'INTERNAL_ERROR',
      ...(details ? { details } : {}),
    });
  }

  protected sendPaginated(res: Response, data: unknown, page: number, limit: number, total: number): void {
    res.status(200).json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }
}
