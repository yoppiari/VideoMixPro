/*
 * TEMPORARILY DISABLED: Admin controller features
 * Reason: Payment, AdminLog, and EmailLog models are not defined in schema.prisma
 * These features will be re-enabled when the missing models are added to the database schema
 * Missing models: Payment, AdminLog, EmailLog
 * Date disabled: 2025-10-04
 */

import { Request, Response } from 'express';
// import { prisma } from '@/utils/database';
// import { AdminService } from '@/services/admin.service';
// import { PaymentService } from '@/services/payment.service';
import logger from '@/utils/logger';
// import { z } from 'zod';
import { AdminRequest } from '@/middleware/admin.middleware';

// All functionality commented out - requires Payment, AdminLog, EmailLog models
export class AdminController {
  static async getDashboardStats(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Admin dashboard stats endpoint disabled - missing Payment/AdminLog models');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async getSystemHealth(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('System health endpoint disabled - missing models');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async getUsers(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Get users endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async getUserDetails(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Get user details endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async updateUser(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Update user endpoint disabled - missing AdminLog model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async createAdminUser(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Create admin user endpoint disabled - missing AdminLog model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async addCreditsToUser(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Add credits endpoint disabled - missing AdminLog model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async getPaymentDashboard(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Payment dashboard endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async bulkApprovePayments(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Bulk approve payments endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async getAdminLogs(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Get admin logs endpoint disabled - missing AdminLog model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async getUserAnalytics(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Get user analytics endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async exportUsers(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Export users endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async getEmailLogs(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Get email logs endpoint disabled - missing EmailLog model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async resendEmail(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Resend email endpoint disabled - missing EmailLog/Payment models');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }

  static async getRevenueAnalytics(req: AdminRequest, res: Response): Promise<void> {
    logger.warn('Revenue analytics endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Admin features temporarily unavailable',
    });
  }
}
