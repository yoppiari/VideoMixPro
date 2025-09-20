import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/utils/database';
import logger from '@/utils/logger';

export interface AdminRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
  };
}

/**
 * Middleware to verify admin access
 * Must be used after authMiddleware
 */
export const adminMiddleware = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    // Check if user has admin role
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      logger.warn(`Unauthorized admin access attempt by user ${user.id} (${user.email})`);
      res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
      return;
    }

    // Optional: Update last login time for admin users
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch((error) => {
      logger.warn('Failed to update last login time:', error);
    });

    logger.info(`Admin access granted to ${user.email} (${user.role})`);
    next();
  } catch (error) {
    logger.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Middleware to verify super admin access
 * Must be used after authMiddleware
 */
export const superAdminMiddleware = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    // Check if user has super admin role
    if (user.role !== 'SUPER_ADMIN') {
      logger.warn(`Unauthorized super admin access attempt by user ${user.id} (${user.email})`);
      res.status(403).json({
        success: false,
        message: 'Super admin access required',
      });
      return;
    }

    logger.info(`Super admin access granted to ${user.email}`);
    next();
  } catch (error) {
    logger.error('Super admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Middleware to check specific permissions
 */
export const permissionMiddleware = (requiredPermissions: string[]) => {
  return async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      // Super admins have all permissions
      if (user.role === 'SUPER_ADMIN') {
        next();
        return;
      }

      // Check admin permissions (for now, admins have most permissions)
      if (user.role === 'ADMIN') {
        // In the future, you can implement granular permissions here
        // For now, admins can do most things except user role changes
        const restrictedPermissions = ['CHANGE_USER_ROLES', 'DELETE_ADMIN_LOGS'];

        const hasRestrictedPermission = requiredPermissions.some(permission =>
          restrictedPermissions.includes(permission)
        );

        if (hasRestrictedPermission) {
          res.status(403).json({
            success: false,
            message: 'Insufficient permissions',
          });
          return;
        }

        next();
        return;
      }

      // Non-admin users don't have any admin permissions
      res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    } catch (error) {
      logger.error('Permission middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
};

/**
 * Log admin action for audit trail
 */
export const logAdminAction = async (
  adminId: string,
  action: string,
  targetType: string,
  targetId?: string,
  description?: string,
  metadata?: any,
  req?: Request
): Promise<void> => {
  try {
    await prisma.adminLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        description: description || `${action} on ${targetType}`,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: req?.ip || req?.connection?.remoteAddress || null,
        userAgent: req?.get('User-Agent') || null,
      },
    });

    logger.info(`Admin action logged: ${action} by ${adminId} on ${targetType}${targetId ? ` (${targetId})` : ''}`);
  } catch (error) {
    logger.error('Failed to log admin action:', error);
  }
};

/**
 * Middleware wrapper to automatically log admin actions
 */
export const loggedAdminAction = (action: string, targetType: string, getTargetId?: (req: Request) => string) => {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json;

    // Override json method to log successful actions
    res.json = function(body: any) {
      // Only log if the action was successful
      if (body.success && req.user) {
        const targetId = getTargetId ? getTargetId(req) : undefined;
        logAdminAction(
          req.user.id,
          action,
          targetType,
          targetId,
          undefined,
          { requestBody: req.body, responseBody: body },
          req
        ).catch((error) => {
          logger.error('Failed to log admin action in middleware:', error);
        });
      }

      // Call original json method
      return originalJson.call(this, body);
    };

    next();
  };
};