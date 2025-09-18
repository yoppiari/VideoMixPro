import { Response } from 'express';
import { ApiResponse, PaginationInfo } from '@/types';
import logger from './logger';

export class ResponseHelper {
  static success<T>(
    res: Response,
    data?: T,
    message?: string,
    statusCode: number = 200,
    pagination?: PaginationInfo
  ): Response<ApiResponse<T>> {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      pagination
    };

    return res.status(statusCode).json(response);
  }

  static error(
    res: Response,
    error: string,
    statusCode: number = 400,
    details?: any
  ): Response<ApiResponse> {
    logger.error('API Error Response', {
      error,
      statusCode,
      details,
      timestamp: new Date().toISOString()
    });

    const response: ApiResponse = {
      success: false,
      error,
      ...(details && { details })
    };

    return res.status(statusCode).json(response);
  }

  static unauthorized(
    res: Response,
    message: string = 'Unauthorized access'
  ): Response<ApiResponse> {
    return this.error(res, message, 401);
  }

  static forbidden(
    res: Response,
    message: string = 'Access forbidden'
  ): Response<ApiResponse> {
    return this.error(res, message, 403);
  }

  static notFound(
    res: Response,
    message: string = 'Resource not found'
  ): Response<ApiResponse> {
    return this.error(res, message, 404);
  }

  static validationError(
    res: Response,
    errors: any,
    message: string = 'Validation failed'
  ): Response<ApiResponse> {
    return this.error(res, message, 422, errors);
  }

  static serverError(
    res: Response,
    message: string = 'Internal server error'
  ): Response<ApiResponse> {
    return this.error(res, message, 500);
  }
}

export const createPagination = (
  page: number,
  limit: number,
  total: number
): PaginationInfo => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit)
});