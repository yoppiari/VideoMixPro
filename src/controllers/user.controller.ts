import { Response } from 'express';
import { prisma } from '@/utils/database';
import { AuthenticatedRequest } from '@/middleware/auth.middleware';
import { ResponseHelper, createPagination } from '@/utils/response';
import { TransactionType } from '@/types';
import logger from '@/utils/logger';

export class UserController {
  async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          credits: true,
          licenseType: true,
          licenseExpiry: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        ResponseHelper.notFound(res, 'User not found');
        return;
      }

      ResponseHelper.success(res, user);
    } catch (error) {
      logger.error('Get profile error:', error);
      ResponseHelper.serverError(res, 'Failed to get profile');
    }
  }

  async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { firstName, lastName } = req.body;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName })
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          credits: true,
          licenseType: true,
          licenseExpiry: true,
          updatedAt: true
        }
      });

      ResponseHelper.success(res, user, 'Profile updated successfully');
    } catch (error) {
      logger.error('Update profile error:', error);
      ResponseHelper.serverError(res, 'Failed to update profile');
    }
  }

  async getCredits(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true }
      });

      if (!user) {
        ResponseHelper.notFound(res, 'User not found');
        return;
      }

      ResponseHelper.success(res, { credits: user.credits });
    } catch (error) {
      logger.error('Get credits error:', error);
      ResponseHelper.serverError(res, 'Failed to get credits');
    }
  }

  async purchaseCredits(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { amount, paymentMethod } = req.body;

      // In production, integrate with payment processor (Stripe, PayPal, etc.)
      // For now, we'll simulate the purchase

      const transaction = await prisma.$transaction(async (tx) => {
        // Update user credits
        const user = await tx.user.update({
          where: { id: userId },
          data: {
            credits: {
              increment: amount
            }
          },
          select: { credits: true }
        });

        // Record transaction
        const creditTransaction = await tx.creditTransaction.create({
          data: {
            userId,
            amount,
            type: TransactionType.PURCHASE,
            description: `Credit purchase via ${paymentMethod}`
          }
        });

        return { user, transaction: creditTransaction };
      });

      ResponseHelper.success(res, {
        credits: transaction.user.credits,
        transaction: transaction.transaction
      }, 'Credits purchased successfully');
    } catch (error) {
      logger.error('Purchase credits error:', error);
      ResponseHelper.serverError(res, 'Failed to purchase credits');
    }
  }

  async getTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { page = '1', limit = '20', type, startDate, endDate } = req.query as any;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      // Build filter conditions
      const where: any = { userId };
      if (type) {
        where.type = type;
      }
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const [transactions, total, currentBalance] = await Promise.all([
        prisma.creditTransaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
          include: {
            payment: {
              select: {
                receiptNumber: true,
                paymentMethod: true,
                status: true
              }
            }
          }
        }),
        prisma.creditTransaction.count({ where }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { credits: true }
        })
      ]);

      // Calculate running balance for each transaction
      let runningBalance = currentBalance?.credits || 0;
      const transactionsWithBalance = transactions.map(transaction => {
        const balanceAfter = runningBalance;
        runningBalance -= transaction.amount;
        return {
          ...transaction,
          balanceAfter,
          balanceBefore: runningBalance
        };
      }).reverse();

      // Get additional details for USAGE transactions
      const enhancedTransactions = await Promise.all(
        transactionsWithBalance.reverse().map(async (transaction) => {
          let additionalInfo = {};

          if (transaction.type === 'USAGE' && transaction.referenceId) {
            // Try to get job details
            const job = await prisma.processingJob.findUnique({
              where: { id: transaction.referenceId },
              select: {
                id: true,
                status: true,
                outputCount: true,
                project: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            });
            if (job) {
              additionalInfo = {
                jobId: job.id,
                jobStatus: job.status,
                projectId: job.project.id,
                projectName: job.project.name,
                outputCount: job.outputCount
              };
            }
          } else if (transaction.type === 'REFUND' && transaction.referenceId) {
            // Get failed job details
            const job = await prisma.processingJob.findUnique({
              where: { id: transaction.referenceId },
              select: {
                id: true,
                errorMessage: true,
                project: {
                  select: {
                    name: true
                  }
                }
              }
            });
            if (job) {
              additionalInfo = {
                jobId: job.id,
                projectName: job.project.name,
                failureReason: job.errorMessage
              };
            }
          }

          return {
            ...transaction,
            ...additionalInfo
          };
        })
      );

      const pagination = createPagination(pageNum, limitNum, total);

      ResponseHelper.success(res, enhancedTransactions, 'Transactions retrieved successfully', 200, pagination);
    } catch (error) {
      logger.error('Get transactions error:', error);
      ResponseHelper.serverError(res, 'Failed to get transactions');
    }
  }

  async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      // Get all stats in parallel
      const [
        totalProjects,
        totalVideos,
        processingJobs,
        completedJobs,
        failedJobs,
        pendingJobs,
        recentProjects
      ] = await Promise.all([
        // Total projects
        prisma.project.count({
          where: { userId }
        }),
        // Total videos
        prisma.videoFile.count({
          where: {
            project: { userId }
          }
        }),
        // Processing jobs
        prisma.processingJob.count({
          where: {
            project: { userId },
            status: 'PROCESSING'
          }
        }),
        // Completed jobs
        prisma.processingJob.count({
          where: {
            project: { userId },
            status: 'COMPLETED'
          }
        }),
        // Failed jobs
        prisma.processingJob.count({
          where: {
            project: { userId },
            status: 'FAILED'
          }
        }),
        // Pending jobs
        prisma.processingJob.count({
          where: {
            project: { userId },
            status: 'PENDING'
          }
        }),
        // Recent projects (last 5)
        prisma.project.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            updatedAt: true,
            _count: {
              select: {
                videoFiles: true,
                processingJobs: true
              }
            }
          }
        })
      ]);

      const stats = {
        totalProjects,
        totalVideos,
        processingJobs,
        completedJobs,
        failedJobs,
        pendingJobs,
        totalJobs: pendingJobs + processingJobs + completedJobs + failedJobs,
        recentProjects: recentProjects.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          videoCount: p._count.videoFiles,
          jobCount: p._count.processingJobs,
          lastActivity: p.updatedAt
        }))
      };

      ResponseHelper.success(res, stats, 'User statistics retrieved successfully');
    } catch (error) {
      logger.error('Get user stats error:', error);
      ResponseHelper.serverError(res, 'Failed to get user statistics');
    }
  }
}