import { Request, Response } from 'express';
import { prisma } from '@/utils/database';
import { AdminService } from '@/services/admin.service';
import { PaymentService } from '@/services/payment.service';
import logger from '@/utils/logger';
import { z } from 'zod';
import { AdminRequest } from '@/middleware/admin.middleware';

const adminService = new AdminService(prisma);
const paymentService = new PaymentService(prisma);

// Validation schemas
const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
  credits: z.number().int().min(0).optional(),
  licenseType: z.string().optional(),
  licenseExpiry: z.string().transform(val => val ? new Date(val) : undefined).optional(),
});

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']),
});

const addCreditsSchema = z.object({
  credits: z.number().int().positive(),
  reason: z.string().min(1),
});

export class AdminController {
  /**
   * Get admin dashboard statistics
   * GET /api/v1/admin/stats
   */
  static async getDashboardStats(req: AdminRequest, res: Response): Promise<void> {
    try {
      const stats = await adminService.getAdminStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get admin stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get dashboard statistics',
      });
    }
  }

  /**
   * Get system health status
   * GET /api/v1/admin/health
   */
  static async getSystemHealth(req: AdminRequest, res: Response): Promise<void> {
    try {
      const health = await adminService.getSystemHealth();

      res.json({
        success: true,
        data: health,
      });
    } catch (error) {
      logger.error('Failed to get system health:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get system health',
      });
    }
  }

  /**
   * Get all users with pagination and filtering
   * GET /api/v1/admin/users
   */
  static async getUsers(req: AdminRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;
      const role = req.query.role as string;
      const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;

      const result = await adminService.getUsers(page, limit, search, role, isActive);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to get users:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get users',
      });
    }
  }

  /**
   * Get user details
   * GET /api/v1/admin/users/:id
   */
  static async getUserDetails(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const user = await adminService.getUserDetails(id);

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      logger.error('Failed to get user details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user details',
      });
    }
  }

  /**
   * Update user information
   * PUT /api/v1/admin/users/:id
   */
  static async updateUser(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = updateUserSchema.parse(req.body);

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const updatedUser = await adminService.updateUser(id, validatedData, req.user.id, req);

      res.json({
        success: true,
        message: 'User updated successfully',
        data: updatedUser,
      });

      logger.info(`User ${id} updated by admin ${req.user.id}`);
    } catch (error) {
      logger.error('Failed to update user:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error && error.message === 'User not found') {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      if (error instanceof Error && error.message === 'Email already exists') {
        res.status(409).json({
          success: false,
          message: 'Email already exists',
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update user',
      });
    }
  }

  /**
   * Create new admin user
   * POST /api/v1/admin/users/create-admin
   */
  static async createAdminUser(req: AdminRequest, res: Response): Promise<void> {
    try {
      const validatedData = createAdminSchema.parse(req.body);

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      // Only super admins can create other admins
      if (req.user.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Super admin access required',
        });
        return;
      }

      const newUser = await adminService.createAdminUser(validatedData, req.user.id, req);

      res.status(201).json({
        success: true,
        message: 'Admin user created successfully',
        data: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
        },
      });

      logger.info(`Admin user created: ${newUser.email} by ${req.user.id}`);
    } catch (error) {
      logger.error('Failed to create admin user:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error && error.message === 'Email already exists') {
        res.status(409).json({
          success: false,
          message: 'Email already exists',
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create admin user',
      });
    }
  }

  /**
   * Add credits to user account
   * POST /api/v1/admin/users/:id/credits
   */
  static async addCreditsToUser(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = addCreditsSchema.parse(req.body);

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const updatedUser = await adminService.addCreditsToUser(
        id,
        validatedData.credits,
        validatedData.reason,
        req.user.id,
        req
      );

      res.json({
        success: true,
        message: 'Credits added successfully',
        data: {
          userId: updatedUser.id,
          newBalance: updatedUser.credits,
          creditsAdded: validatedData.credits,
        },
      });

      logger.info(`${validatedData.credits} credits added to user ${id} by admin ${req.user.id}`);
    } catch (error) {
      logger.error('Failed to add credits:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error && error.message === 'User not found') {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to add credits',
      });
    }
  }

  /**
   * Get payment management dashboard data
   * GET /api/v1/admin/payments/dashboard
   */
  static async getPaymentDashboard(req: AdminRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      const searchQuery = req.query.search as string;

      const result = await paymentService.getAllPayments(page, limit, status, searchQuery);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to get payment dashboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payment dashboard',
      });
    }
  }

  /**
   * Bulk approve payments
   * POST /api/v1/admin/payments/bulk-approve
   */
  static async bulkApprovePayments(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { paymentIds, paymentMethod, notes } = req.body;

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Payment IDs array is required',
        });
        return;
      }

      const results = [];
      const errors = [];

      for (const paymentId of paymentIds) {
        try {
          const payment = await paymentService.markPaymentAsPaid(
            paymentId,
            paymentMethod,
            notes,
            req.user.id
          );
          results.push(payment);
        } catch (error) {
          errors.push({ paymentId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      res.json({
        success: true,
        message: `Bulk approval completed. ${results.length} payments approved, ${errors.length} errors.`,
        data: {
          approved: results,
          errors,
        },
      });

      logger.info(`Bulk payment approval: ${results.length} approved, ${errors.length} errors by admin ${req.user.id}`);
    } catch (error) {
      logger.error('Failed to bulk approve payments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk approve payments',
      });
    }
  }

  /**
   * Get admin activity logs
   * GET /api/v1/admin/logs
   */
  static async getAdminLogs(req: AdminRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const adminId = req.query.adminId as string;
      const action = req.query.action as string;
      const targetType = req.query.targetType as string;

      const result = await adminService.getAdminLogs(page, limit, adminId, action, targetType);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to get admin logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get admin logs',
      });
    }
  }

  /**
   * Get user analytics and trends
   * GET /api/v1/admin/analytics/users
   */
  static async getUserAnalytics(req: AdminRequest, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 30;

      const analytics = await adminService.getUserAnalytics(days);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error('Failed to get user analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user analytics',
      });
    }
  }

  /**
   * Export users data
   * GET /api/v1/admin/users/export
   */
  static async exportUsers(req: AdminRequest, res: Response): Promise<void> {
    try {
      const csvData = await adminService.exportUsersData();

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
      res.send(csvData);

      logger.info(`Users data exported by admin ${req.user?.id}`);
    } catch (error) {
      logger.error('Failed to export users:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export users data',
      });
    }
  }

  /**
   * Get email logs and management
   * GET /api/v1/admin/emails
   */
  static async getEmailLogs(req: AdminRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string;
      const emailType = req.query.emailType as string;

      const skip = (page - 1) * limit;
      const where: any = {};

      if (status) where.status = status;
      if (emailType) where.emailType = emailType;

      const [emailLogs, totalCount] = await Promise.all([
        prisma.emailLog.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            payment: {
              select: {
                id: true,
                receiptNumber: true,
                amount: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.emailLog.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          emailLogs,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
        },
      });
    } catch (error) {
      logger.error('Failed to get email logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get email logs',
      });
    }
  }

  /**
   * Resend failed emails
   * POST /api/v1/admin/emails/:id/resend
   */
  static async resendEmail(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const emailLog = await prisma.emailLog.findUnique({
        where: { id },
        include: {
          user: true,
          payment: true,
        },
      });

      if (!emailLog) {
        res.status(404).json({
          success: false,
          message: 'Email log not found',
        });
        return;
      }

      // TODO: Implement email resend logic based on email type
      res.json({
        success: true,
        message: 'Email resend functionality will be implemented in the next phase',
        data: emailLog,
      });
    } catch (error) {
      logger.error('Failed to resend email:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resend email',
      });
    }
  }

  /**
   * Get payment revenue analytics
   * GET /api/v1/admin/analytics/revenue
   */
  static async getRevenueAnalytics(req: AdminRequest, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Daily revenue trend
      const dailyRevenue = await prisma.payment.groupBy({
        by: ['paidAt'],
        where: {
          status: 'PAID',
          paidAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          amount: true,
        },
      });

      // Payment methods distribution
      const paymentMethods = await prisma.payment.groupBy({
        by: ['paymentMethod'],
        where: {
          status: 'PAID',
          paidAt: {
            gte: startDate,
          },
        },
        _count: true,
        _sum: {
          amount: true,
        },
      });

      // Monthly comparison
      const thisMonth = await prisma.payment.aggregate({
        where: {
          status: 'PAID',
          paidAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { amount: true },
        _count: true,
      });

      const lastMonth = await prisma.payment.aggregate({
        where: {
          status: 'PAID',
          paidAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
            lt: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { amount: true },
        _count: true,
      });

      res.json({
        success: true,
        data: {
          dailyRevenue,
          paymentMethods,
          monthlyComparison: {
            thisMonth: {
              revenue: thisMonth._sum.amount || 0,
              count: thisMonth._count,
            },
            lastMonth: {
              revenue: lastMonth._sum.amount || 0,
              count: lastMonth._count,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get revenue analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get revenue analytics',
      });
    }
  }
}