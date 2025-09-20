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

      const { page = '1', limit = '10' } = req.query as any;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      const [transactions, total] = await Promise.all([
        prisma.creditTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum
        }),
        prisma.creditTransaction.count({
          where: { userId }
        })
      ]);

      const pagination = createPagination(pageNum, limitNum, total);

      ResponseHelper.success(res, transactions, 'Transactions retrieved successfully', 200, pagination);
    } catch (error) {
      logger.error('Get transactions error:', error);
      ResponseHelper.serverError(res, 'Failed to get transactions');
    }
  }
}