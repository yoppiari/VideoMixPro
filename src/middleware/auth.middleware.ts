import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@/utils/database';
import { AuthTokenPayload } from '@/types';
import { ResponseHelper } from '@/utils/response';
import logger from '@/utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      ResponseHelper.unauthorized(res, 'Access token required');
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET not configured');
      ResponseHelper.serverError(res, 'Authentication configuration error');
      return;
    }

    const decoded = jwt.verify(token, secret) as AuthTokenPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        licenseType: true,
        licenseExpiry: true
      }
    });

    if (!user || !user.isActive) {
      ResponseHelper.unauthorized(res, 'Invalid or inactive user');
      return;
    }

    if (user.licenseExpiry && user.licenseExpiry < new Date()) {
      ResponseHelper.unauthorized(res, 'License expired');
      return;
    }

    req.user = {
      ...decoded,
      email: user.email,
    } as any;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      ResponseHelper.unauthorized(res, 'Invalid token');
      return;
    }

    logger.error('Authentication error:', error);
    ResponseHelper.serverError(res, 'Authentication failed');
  }
};

// Backward compatibility
export const authenticateToken = authMiddleware;