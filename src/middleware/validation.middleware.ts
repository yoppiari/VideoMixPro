import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ResponseHelper } from '@/utils/response';

export const validateRequest = (
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = source === 'body' ? req.body :
                   source === 'query' ? req.query :
                   req.params;

      const validated = schema.parse(data);

      if (source === 'body') {
        req.body = validated;
      } else if (source === 'query') {
        req.query = validated;
      } else {
        req.params = validated;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));

        ResponseHelper.validationError(res, errors, 'Validation failed');
        return;
      }

      ResponseHelper.serverError(res, 'Validation error');
    }
  };
};