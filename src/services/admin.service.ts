import { PrismaClient, User, Payment, AdminLog } from '@prisma/client';
import bcrypt from 'bcryptjs';
import logger from '@/utils/logger';
import { logAdminAction } from '@/middleware/admin.middleware';

export interface UserUpdateData {
  email?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  credits?: number;
  licenseType?: string;
  licenseExpiry?: Date;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalAdmins: number;
  totalPayments: number;
  totalRevenue: number;
  pendingPayments: number;
  recentUsers: number; // Last 30 days
  recentPayments: number; // Last 30 days
}

export interface SystemHealth {
  database: 'healthy' | 'warning' | 'error';
  emailService: 'healthy' | 'warning' | 'error';
  storage: 'healthy' | 'warning' | 'error';
  uptime: number;
  memoryUsage: number;
  diskUsage?: number;
}

export class AdminService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get comprehensive admin dashboard statistics
   */
  async getAdminStats(): Promise<AdminStats> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        activeUsers,
        totalAdmins,
        totalPayments,
        totalRevenue,
        pendingPayments,
        recentUsers,
        recentPayments,
      ] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } }),
        this.prisma.payment.count(),
        this.prisma.payment.aggregate({
          where: { status: 'PAID' },
          _sum: { amount: true },
        }),
        this.prisma.payment.count({ where: { status: 'PENDING' } }),
        this.prisma.user.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
        this.prisma.payment.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
      ]);

      return {
        totalUsers,
        activeUsers,
        totalAdmins,
        totalPayments,
        totalRevenue: totalRevenue._sum.amount || 0,
        pendingPayments,
        recentUsers,
        recentPayments,
      };
    } catch (error) {
      logger.error('Failed to get admin stats:', error);
      throw error;
    }
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    try {
      const health: SystemHealth = {
        database: 'healthy',
        emailService: 'healthy',
        storage: 'healthy',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      };

      // Test database connection
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        health.database = 'healthy';
      } catch (error) {
        logger.error('Database health check failed:', error);
        health.database = 'error';
      }

      // Test email service (basic check)
      try {
        const { EmailService } = await import('./email.service');
        const emailService = new EmailService();
        const isValid = await emailService.testEmailConfiguration();
        health.emailService = isValid ? 'healthy' : 'warning';
      } catch (error) {
        logger.error('Email service health check failed:', error);
        health.emailService = 'error';
      }

      return health;
    } catch (error) {
      logger.error('Failed to get system health:', error);
      throw error;
    }
  }

  /**
   * Get all users with pagination and filtering
   */
  async getUsers(
    page: number = 1,
    limit: number = 20,
    search?: string,
    role?: string,
    isActive?: boolean
  ): Promise<{
    users: User[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (role) {
        where.role = role;
      }

      if (typeof isActive === 'boolean') {
        where.isActive = isActive;
      }

      const [users, totalCount] = await Promise.all([
        this.prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            credits: true,
            licenseType: true,
            licenseExpiry: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                payments: true,
                projects: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.user.count({ where }),
      ]);

      return {
        users: users as any[],
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    } catch (error) {
      logger.error('Failed to get users:', error);
      throw error;
    }
  }

  /**
   * Get user details with payment history
   */
  async getUserDetails(userId: string): Promise<User & {
    payments: Payment[];
    totalSpent: number;
    recentActivity: any[];
  } | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          projects: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              status: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          creditTransactions: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!user) {
        return null;
      }

      // Calculate total spent
      const totalSpent = user.payments
        .filter(payment => payment.status === 'PAID')
        .reduce((sum, payment) => sum + payment.amount, 0);

      // Create recent activity timeline
      const recentActivity = [
        ...user.payments.map(payment => ({
          type: 'payment',
          action: `Payment ${payment.status.toLowerCase()}`,
          amount: payment.amount,
          date: payment.createdAt,
          id: payment.id,
        })),
        ...user.projects.map(project => ({
          type: 'project',
          action: `Project ${project.status.toLowerCase()}`,
          name: project.name,
          date: project.createdAt,
          id: project.id,
        })),
        ...user.creditTransactions.map(transaction => ({
          type: 'credit',
          action: `Credits ${transaction.type.toLowerCase()}`,
          amount: transaction.amount,
          date: transaction.createdAt,
          id: transaction.id,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);

      return {
        ...user,
        totalSpent,
        recentActivity,
      } as any;
    } catch (error) {
      logger.error(`Failed to get user details for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update user information (admin action)
   */
  async updateUser(
    userId: string,
    updateData: UserUpdateData,
    adminId: string,
    req?: any
  ): Promise<User> {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        throw new Error('User not found');
      }

      // Prepare update data
      const dataToUpdate: any = {};

      if (updateData.email && updateData.email !== existingUser.email) {
        // Check if email is already taken
        const emailExists = await this.prisma.user.findUnique({
          where: { email: updateData.email },
        });

        if (emailExists && emailExists.id !== userId) {
          throw new Error('Email already exists');
        }

        dataToUpdate.email = updateData.email;
      }

      if (updateData.firstName !== undefined) dataToUpdate.firstName = updateData.firstName;
      if (updateData.lastName !== undefined) dataToUpdate.lastName = updateData.lastName;
      if (updateData.isActive !== undefined) dataToUpdate.isActive = updateData.isActive;
      if (updateData.role !== undefined) dataToUpdate.role = updateData.role;
      if (updateData.licenseType !== undefined) dataToUpdate.licenseType = updateData.licenseType;
      if (updateData.licenseExpiry !== undefined) dataToUpdate.licenseExpiry = updateData.licenseExpiry;

      // Handle credits separately to track changes
      if (updateData.credits !== undefined && updateData.credits !== existingUser.credits) {
        const creditDifference = updateData.credits - existingUser.credits;
        dataToUpdate.credits = updateData.credits;

        // Create credit transaction record
        await this.prisma.creditTransaction.create({
          data: {
            userId,
            amount: creditDifference,
            type: creditDifference > 0 ? 'ADMIN_ADD' : 'ADMIN_REMOVE',
            description: `Admin ${creditDifference > 0 ? 'added' : 'removed'} ${Math.abs(creditDifference)} credits`,
          },
        });
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: dataToUpdate,
      });

      // Log admin action
      await logAdminAction(
        adminId,
        'USER_UPDATED',
        'USER',
        userId,
        `Updated user ${existingUser.email}`,
        { changes: dataToUpdate, oldData: existingUser },
        req
      );

      logger.info(`User ${userId} updated by admin ${adminId}`);
      return updatedUser;
    } catch (error) {
      logger.error(`Failed to update user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create new admin user
   */
  async createAdminUser(
    userData: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: 'ADMIN' | 'SUPER_ADMIN';
    },
    creatorAdminId: string,
    req?: any
  ): Promise<User> {
    try {
      // Check if email already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existingUser) {
        throw new Error('Email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      const newUser = await this.prisma.user.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          isActive: true,
        },
      });

      // Log admin action
      await logAdminAction(
        creatorAdminId,
        'ADMIN_USER_CREATED',
        'USER',
        newUser.id,
        `Created new ${userData.role} user: ${userData.email}`,
        { role: userData.role },
        req
      );

      logger.info(`New ${userData.role} user created: ${userData.email} by admin ${creatorAdminId}`);
      return newUser;
    } catch (error) {
      logger.error('Failed to create admin user:', error);
      throw error;
    }
  }

  /**
   * Get admin activity logs
   */
  async getAdminLogs(
    page: number = 1,
    limit: number = 50,
    adminId?: string,
    action?: string,
    targetType?: string
  ): Promise<{
    logs: (AdminLog & { admin: User })[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (adminId) where.adminId = adminId;
      if (action) where.action = action;
      if (targetType) where.targetType = targetType;

      const [logs, totalCount] = await Promise.all([
        this.prisma.adminLog.findMany({
          where,
          include: {
            admin: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.adminLog.count({ where }),
      ]);

      return {
        logs,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    } catch (error) {
      logger.error('Failed to get admin logs:', error);
      throw error;
    }
  }

  /**
   * Add credits to user account (admin action)
   */
  async addCreditsToUser(
    userId: string,
    credits: number,
    reason: string,
    adminId: string,
    req?: any
  ): Promise<User> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Update user credits and create transaction record in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            credits: {
              increment: credits,
            },
          },
        });

        await tx.creditTransaction.create({
          data: {
            userId,
            amount: credits,
            type: 'ADMIN_ADD',
            description: reason || `Admin added ${credits} credits`,
          },
        });

        return updatedUser;
      });

      // Log admin action
      await logAdminAction(
        adminId,
        'CREDITS_ADDED',
        'USER',
        userId,
        `Added ${credits} credits to ${user.email}: ${reason}`,
        { credits, reason },
        req
      );

      logger.info(`Admin ${adminId} added ${credits} credits to user ${userId}`);
      return result;
    } catch (error) {
      logger.error(`Failed to add credits to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user statistics for analytics
   */
  async getUserAnalytics(days: number = 30): Promise<{
    registrationTrend: { date: string; count: number }[];
    activationRate: number;
    topLicenseTypes: { type: string; count: number }[];
    creditUsage: { totalAdded: number; totalUsed: number; averageBalance: number };
  }> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Registration trend
      const registrations = await this.prisma.user.groupBy({
        by: ['createdAt'],
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: true,
      });

      // Group by date
      const registrationTrend = this.groupByDate(registrations, days);

      // Activation rate (users who have made at least one payment)
      const totalUsers = await this.prisma.user.count();
      const activeUsers = await this.prisma.user.count({
        where: {
          payments: {
            some: {
              status: 'PAID',
            },
          },
        },
      });

      const activationRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;

      // License types distribution
      const licenseTypes = await this.prisma.user.groupBy({
        by: ['licenseType'],
        _count: true,
        orderBy: {
          _count: {
            licenseType: 'desc',
          },
        },
      });

      const topLicenseTypes = licenseTypes.map(item => ({
        type: item.licenseType,
        count: item._count,
      }));

      // Credit usage analytics
      const creditTransactions = await this.prisma.creditTransaction.aggregate({
        _sum: {
          amount: true,
        },
        where: {
          createdAt: {
            gte: startDate,
          },
        },
      });

      const averageCredits = await this.prisma.user.aggregate({
        _avg: {
          credits: true,
        },
      });

      return {
        registrationTrend,
        activationRate,
        topLicenseTypes,
        creditUsage: {
          totalAdded: creditTransactions._sum.amount || 0,
          totalUsed: 0, // TODO: Implement usage tracking
          averageBalance: averageCredits._avg.credits || 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get user analytics:', error);
      throw error;
    }
  }

  /**
   * Helper method to group data by date
   */
  private groupByDate(data: any[], days: number): { date: string; count: number }[] {
    const result: { date: string; count: number }[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      const count = data.filter(item => {
        const itemDate = new Date(item.createdAt).toISOString().split('T')[0];
        return itemDate === dateStr;
      }).length;

      result.push({ date: dateStr, count });
    }

    return result;
  }

  /**
   * Export users data to CSV format
   */
  async exportUsersData(): Promise<string> {
    try {
      const users = await this.prisma.user.findMany({
        include: {
          _count: {
            select: {
              payments: true,
              projects: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const csvHeader = 'ID,Email,First Name,Last Name,Role,Active,Credits,License Type,License Expiry,Total Payments,Total Projects,Created At,Last Login\n';

      const csvData = users.map(user => [
        user.id,
        user.email,
        user.firstName,
        user.lastName,
        user.role,
        user.isActive,
        user.credits,
        user.licenseType,
        user.licenseExpiry ? user.licenseExpiry.toISOString() : '',
        user._count.payments,
        user._count.projects,
        user.createdAt.toISOString(),
        user.lastLoginAt ? user.lastLoginAt.toISOString() : '',
      ].map(field => `"${field}"`).join(',')).join('\n');

      return csvHeader + csvData;
    } catch (error) {
      logger.error('Failed to export users data:', error);
      throw error;
    }
  }
}