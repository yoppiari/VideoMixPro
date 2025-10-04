/*
 * TEMPORARILY DISABLED: Payment controller
 * Reason: Payment model is not defined in schema.prisma
 * This controller will be re-enabled when Payment model is added to the database schema
 * Missing models: Payment
 * Date disabled: 2025-10-04
 */

import { Request, Response } from 'express';
import logger from '@/utils/logger';

// All payment functionality commented out - requires Payment model
export class PaymentController {
  static async createPayment(req: Request, res: Response): Promise<void> {
    logger.warn('Create payment endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async updatePaymentStatus(req: Request, res: Response): Promise<void> {
    logger.warn('Update payment status endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async markPaymentAsPaid(req: Request, res: Response): Promise<void> {
    logger.warn('Mark payment as paid endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async getPaymentById(req: Request, res: Response): Promise<void> {
    logger.warn('Get payment by ID endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async getPaymentByReceiptNumber(req: Request, res: Response): Promise<void> {
    logger.warn('Get payment by receipt endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async getUserPayments(req: Request, res: Response): Promise<void> {
    logger.warn('Get user payments endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async getMyPayments(req: Request, res: Response): Promise<void> {
    logger.warn('Get my payments endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async getAllPayments(req: Request, res: Response): Promise<void> {
    logger.warn('Get all payments endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async getPaymentStats(req: Request, res: Response): Promise<void> {
    logger.warn('Get payment stats endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async cancelPayment(req: Request, res: Response): Promise<void> {
    logger.warn('Cancel payment endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async getPendingPayments(req: Request, res: Response): Promise<void> {
    logger.warn('Get pending payments endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async downloadReceipt(req: Request, res: Response): Promise<void> {
    logger.warn('Download receipt endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }

  static async createMyPayment(req: Request, res: Response): Promise<void> {
    logger.warn('Create my payment endpoint disabled - missing Payment model');
    res.status(503).json({
      success: false,
      message: 'Payment features temporarily unavailable',
    });
  }
}
