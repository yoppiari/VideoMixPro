import { Request, Response } from 'express';
import { prisma } from '@/utils/database';
import { PaymentService } from '@/services/payment.service';
import logger from '@/utils/logger';
import { z } from 'zod';

const paymentService = new PaymentService(prisma);

// Validation schemas
const createPaymentSchema = z.object({
  userId: z.string().cuid(),
  amount: z.number().positive(),
  currency: z.string().optional().default('IDR'),
  creditsAmount: z.number().int().positive(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

const updatePaymentStatusSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'CANCELLED']),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

const markAsPaidSchema = z.object({
  paymentMethod: z.string().optional(),
  adminNotes: z.string().optional(),
});

export class PaymentController {
  /**
   * Create a new payment transaction
   * POST /api/payments
   */
  static async createPayment(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = createPaymentSchema.parse(req.body);

      const payment = await paymentService.createPayment(validatedData);

      res.status(201).json({
        success: true,
        message: 'Payment created successfully',
        data: payment,
      });

      logger.info(`Payment created: ${payment.id} by user ${req.user?.id}`);
    } catch (error) {
      logger.error('Failed to create payment:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create payment',
      });
    }
  }

  /**
   * Update payment status (main API for manual payment management)
   * PUT /api/payments/:id/status
   */
  static async updatePaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = updatePaymentStatusSchema.parse(req.body);

      const payment = await paymentService.updatePaymentStatus(
        id,
        validatedData,
        req.user?.id
      );

      res.json({
        success: true,
        message: 'Payment status updated successfully',
        data: payment,
      });

      logger.info(`Payment ${id} status updated to ${validatedData.status} by ${req.user?.id}`);
    } catch (error) {
      logger.error('Failed to update payment status:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error && error.message === 'Payment not found') {
        res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update payment status',
      });
    }
  }

  /**
   * Mark payment as paid and add credits (main API for payment confirmation)
   * POST /api/payments/:id/mark-paid
   */
  static async markPaymentAsPaid(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = markAsPaidSchema.parse(req.body);

      const payment = await paymentService.markPaymentAsPaid(
        id,
        validatedData.paymentMethod,
        validatedData.adminNotes,
        req.user?.id
      );

      res.json({
        success: true,
        message: 'Payment marked as paid and credits added successfully',
        data: payment,
      });

      logger.info(`Payment ${id} marked as paid by ${req.user?.id}`);
    } catch (error) {
      logger.error('Failed to mark payment as paid:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
        return;
      }

      if (error instanceof Error && error.message.includes('already marked as paid')) {
        res.status(409).json({
          success: false,
          message: 'Payment is already marked as paid',
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to mark payment as paid',
      });
    }
  }

  /**
   * Get payment by ID
   * GET /api/payments/:id
   */
  static async getPaymentById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const payment = await paymentService.getPaymentById(id);

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
        return;
      }

      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      logger.error('Failed to get payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payment',
      });
    }
  }

  /**
   * Get payment by receipt number
   * GET /api/payments/receipt/:receiptNumber
   */
  static async getPaymentByReceiptNumber(req: Request, res: Response): Promise<void> {
    try {
      const { receiptNumber } = req.params;

      const payment = await paymentService.getPaymentByReceiptNumber(receiptNumber);

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
        return;
      }

      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      logger.error('Failed to get payment by receipt number:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payment',
      });
    }
  }

  /**
   * Get user's payment history
   * GET /api/payments/user/:userId
   */
  static async getUserPayments(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      // Check if user is requesting their own payments or has admin access
      if (req.user?.id !== userId && req.user?.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Access denied',
        });
        return;
      }

      const result = await paymentService.getUserPayments(userId, page, limit, status);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to get user payments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user payments',
      });
    }
  }

  /**
   * Get current user's payment history
   * GET /api/payments/my-payments
   */
  static async getMyPayments(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      const result = await paymentService.getUserPayments(userId, page, limit, status);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to get my payments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payments',
      });
    }
  }

  /**
   * Get all payments (admin only)
   * GET /api/payments
   */
  static async getAllPayments(req: Request, res: Response): Promise<void> {
    try {
      // Check admin access
      if (req.user?.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Admin access required',
        });
        return;
      }

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
      logger.error('Failed to get all payments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payments',
      });
    }
  }

  /**
   * Get payment statistics (admin only)
   * GET /api/payments/stats
   */
  static async getPaymentStats(req: Request, res: Response): Promise<void> {
    try {
      // Check admin access
      if (req.user?.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Admin access required',
        });
        return;
      }

      const stats = await paymentService.getPaymentStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get payment stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payment statistics',
      });
    }
  }

  /**
   * Cancel payment
   * POST /api/payments/:id/cancel
   */
  static async cancelPayment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const payment = await paymentService.cancelPayment(id, reason, req.user?.id);

      res.json({
        success: true,
        message: 'Payment cancelled successfully',
        data: payment,
      });

      logger.info(`Payment ${id} cancelled by ${req.user?.id}`);
    } catch (error) {
      logger.error('Failed to cancel payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel payment',
      });
    }
  }

  /**
   * Get pending payments (admin only)
   * GET /api/payments/pending
   */
  static async getPendingPayments(req: Request, res: Response): Promise<void> {
    try {
      // Check admin access
      if (req.user?.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Admin access required',
        });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const payments = await paymentService.getPendingPayments(limit);

      res.json({
        success: true,
        data: payments,
      });
    } catch (error) {
      logger.error('Failed to get pending payments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get pending payments',
      });
    }
  }

  /**
   * Download receipt PDF
   * GET /api/payments/:id/receipt
   */
  static async downloadReceipt(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const payment = await paymentService.getPaymentById(id);

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
        return;
      }

      // Check if user owns this payment or has admin access
      if (req.user?.id !== payment.userId && req.user?.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Access denied',
        });
        return;
      }

      if (payment.status !== 'PAID') {
        res.status(400).json({
          success: false,
          message: 'Receipt not available for unpaid payments',
        });
        return;
      }

      // For this example, we'll return the receipt path
      // In production, you'd stream the PDF file
      const receiptService = new (await import('@/services/receipt.service')).ReceiptService();
      const receiptPath = receiptService.getReceiptPath(payment.receiptNumber);

      res.json({
        success: true,
        message: 'Receipt available',
        data: {
          receiptPath,
          downloadUrl: `/api/payments/${id}/receipt/download`,
        },
      });
    } catch (error) {
      logger.error('Failed to get receipt:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get receipt',
      });
    }
  }

  /**
   * Create payment for current user (simplified API)
   * POST /api/payments/create-mine
   */
  static async createMyPayment(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const { amount, creditsAmount, paymentMethod, notes } = req.body;

      const validatedData = createPaymentSchema.parse({
        userId,
        amount,
        creditsAmount,
        paymentMethod,
        notes,
      });

      const payment = await paymentService.createPayment(validatedData);

      res.status(201).json({
        success: true,
        message: 'Payment created successfully',
        data: payment,
      });

      logger.info(`Payment created: ${payment.id} by user ${userId}`);
    } catch (error) {
      logger.error('Failed to create my payment:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create payment',
      });
    }
  }
}