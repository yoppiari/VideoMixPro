import { PrismaClient, Payment } from '@prisma/client';
import moment from 'moment';
import logger from '@/utils/logger';
import { EmailService } from './email.service';
import { ReceiptService } from './receipt.service';

export interface PaymentCreateData {
  userId: string;
  amount: number;
  currency?: string;
  creditsAmount: number;
  paymentMethod?: string;
  notes?: string;
}

export interface PaymentUpdateData {
  status?: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  paymentMethod?: string;
  notes?: string;
  paidAt?: Date;
}

export interface PaymentStats {
  totalPayments: number;
  totalRevenue: number;
  pendingPayments: number;
  paidPayments: number;
  failedPayments: number;
  monthlyRevenue: number;
  todayRevenue: number;
}

export class PaymentService {
  private prisma: PrismaClient;
  private emailService: EmailService;
  private receiptService: ReceiptService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.emailService = new EmailService();
    this.receiptService = new ReceiptService();
  }

  /**
   * Create a new payment transaction
   */
  async createPayment(data: PaymentCreateData): Promise<Payment> {
    try {
      // Generate unique receipt number: INV-YYYY-MM-XXXXXX
      const receiptNumber = await this.generateReceiptNumber();

      const payment = await this.prisma.payment.create({
        data: {
          userId: data.userId,
          receiptNumber,
          amount: data.amount,
          currency: data.currency || 'IDR',
          creditsAmount: data.creditsAmount,
          status: 'PENDING',
          paymentMethod: data.paymentMethod,
          notes: data.notes,
        },
        include: {
          user: true,
        },
      });

      logger.info(`Payment created: ${payment.id} for user ${data.userId}`);

      // Send payment created email
      await this.emailService.sendPaymentCreatedEmail(payment);

      // Log email event
      await this.logEmailEvent(
        payment.userId,
        payment.id,
        'PAYMENT_CREATED',
        payment.user.email,
        'Payment Created - Receipt ' + payment.receiptNumber,
        'payment_created'
      );

      return payment;
    } catch (error) {
      logger.error('Failed to create payment:', error);
      throw error;
    }
  }

  /**
   * Update payment status (main API for manual payment management)
   */
  async updatePaymentStatus(
    paymentId: string,
    updateData: PaymentUpdateData,
    adminUserId?: string
  ): Promise<Payment> {
    try {
      const existingPayment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: { user: true },
      });

      if (!existingPayment) {
        throw new Error('Payment not found');
      }

      const updatePayload: any = {
        ...updateData,
        updatedAt: new Date(),
      };

      // If status is being changed to PAID, set paidAt timestamp
      if (updateData.status === 'PAID' && existingPayment.status !== 'PAID') {
        updatePayload.paidAt = new Date();
      }

      const payment = await this.prisma.payment.update({
        where: { id: paymentId },
        data: updatePayload,
        include: { user: true },
      });

      logger.info(`Payment ${paymentId} updated to status: ${payment.status}`);

      // Handle status change notifications
      await this.handleStatusChange(existingPayment, payment, adminUserId);

      return payment;
    } catch (error) {
      logger.error(`Failed to update payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Mark payment as paid and add credits to user
   */
  async markPaymentAsPaid(
    paymentId: string,
    paymentMethod?: string,
    adminNotes?: string,
    adminUserId?: string
  ): Promise<Payment> {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: { user: true },
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status === 'PAID') {
        throw new Error('Payment is already marked as paid');
      }

      // Start transaction to ensure atomicity
      const result = await this.prisma.$transaction(async (tx) => {
        // Update payment status
        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'PAID',
            paymentMethod: paymentMethod || payment.paymentMethod,
            notes: adminNotes || payment.notes,
            paidAt: new Date(),
          },
          include: { user: true },
        });

        // Add credits to user
        await tx.user.update({
          where: { id: payment.userId },
          data: {
            credits: {
              increment: payment.creditsAmount,
            },
          },
        });

        // Create credit transaction record
        await tx.creditTransaction.create({
          data: {
            userId: payment.userId,
            amount: payment.creditsAmount,
            type: 'PURCHASE',
            description: `Credit purchase - Payment ${payment.receiptNumber}`,
            paymentId: payment.id,
          },
        });

        return updatedPayment;
      });

      logger.info(`Payment ${paymentId} marked as paid, ${payment.creditsAmount} credits added to user ${payment.userId}`);

      // Send payment confirmed email
      await this.emailService.sendPaymentConfirmedEmail(result);

      // Generate and send receipt
      const receiptPath = await this.receiptService.generateReceipt(result);
      await this.emailService.sendReceiptEmail(result, receiptPath);

      // Log email events
      await this.logEmailEvent(
        result.userId,
        result.id,
        'PAYMENT_CONFIRMED',
        result.user.email,
        'Payment Confirmed - ' + result.receiptNumber,
        'payment_confirmed'
      );

      await this.logEmailEvent(
        result.userId,
        result.id,
        'RECEIPT_SENT',
        result.user.email,
        'Receipt - ' + result.receiptNumber,
        'receipt_delivery'
      );

      return result;
    } catch (error) {
      logger.error(`Failed to mark payment ${paymentId} as paid:`, error);
      throw error;
    }
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId: string): Promise<Payment | null> {
    try {
      return await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          user: true,
          creditTransactions: true,
          emailLogs: true,
        },
      });
    } catch (error) {
      logger.error(`Failed to get payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Get payment by receipt number
   */
  async getPaymentByReceiptNumber(receiptNumber: string): Promise<Payment | null> {
    try {
      return await this.prisma.payment.findUnique({
        where: { receiptNumber },
        include: {
          user: true,
          creditTransactions: true,
          emailLogs: true,
        },
      });
    } catch (error) {
      logger.error(`Failed to get payment by receipt ${receiptNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get payments for a user with pagination
   */
  async getUserPayments(
    userId: string,
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<{
    payments: Payment[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const where: any = { userId };

      if (status) {
        where.status = status;
      }

      const [payments, totalCount] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          include: {
            user: true,
            creditTransactions: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.payment.count({ where }),
      ]);

      return {
        payments,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    } catch (error) {
      logger.error(`Failed to get payments for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get all payments with pagination (admin)
   */
  async getAllPayments(
    page: number = 1,
    limit: number = 20,
    status?: string,
    searchQuery?: string
  ): Promise<{
    payments: Payment[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    stats: PaymentStats;
  }> {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (status) {
        where.status = status;
      }

      if (searchQuery) {
        where.OR = [
          { receiptNumber: { contains: searchQuery } },
          { user: { email: { contains: searchQuery } } },
          { user: { firstName: { contains: searchQuery } } },
          { user: { lastName: { contains: searchQuery } } },
        ];
      }

      const [payments, totalCount, stats] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          include: {
            user: true,
            creditTransactions: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.payment.count({ where }),
        this.getPaymentStats(),
      ]);

      return {
        payments,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        stats,
      };
    } catch (error) {
      logger.error('Failed to get all payments:', error);
      throw error;
    }
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(): Promise<PaymentStats> {
    try {
      const today = moment().startOf('day').toDate();
      const monthStart = moment().startOf('month').toDate();

      const [
        totalPayments,
        totalRevenue,
        pendingPayments,
        paidPayments,
        failedPayments,
        monthlyRevenue,
        todayRevenue,
      ] = await Promise.all([
        this.prisma.payment.count(),
        this.prisma.payment.aggregate({
          where: { status: 'PAID' },
          _sum: { amount: true },
        }),
        this.prisma.payment.count({ where: { status: 'PENDING' } }),
        this.prisma.payment.count({ where: { status: 'PAID' } }),
        this.prisma.payment.count({ where: { status: 'FAILED' } }),
        this.prisma.payment.aggregate({
          where: {
            status: 'PAID',
            paidAt: { gte: monthStart },
          },
          _sum: { amount: true },
        }),
        this.prisma.payment.aggregate({
          where: {
            status: 'PAID',
            paidAt: { gte: today },
          },
          _sum: { amount: true },
        }),
      ]);

      return {
        totalPayments,
        totalRevenue: totalRevenue._sum.amount || 0,
        pendingPayments,
        paidPayments,
        failedPayments,
        monthlyRevenue: monthlyRevenue._sum.amount || 0,
        todayRevenue: todayRevenue._sum.amount || 0,
      };
    } catch (error) {
      logger.error('Failed to get payment stats:', error);
      throw error;
    }
  }

  /**
   * Generate unique receipt number
   */
  private async generateReceiptNumber(): Promise<string> {
    const now = moment();
    const prefix = `INV-${now.format('YYYY-MM')}`;

    // Get the latest receipt number for this month
    const latestPayment = await this.prisma.payment.findFirst({
      where: {
        receiptNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        receiptNumber: 'desc',
      },
    });

    let sequence = 1;
    if (latestPayment) {
      const lastSequence = parseInt(latestPayment.receiptNumber.split('-').pop() || '0');
      sequence = lastSequence + 1;
    }

    return `${prefix}-${sequence.toString().padStart(6, '0')}`;
  }

  /**
   * Handle payment status change notifications
   */
  private async handleStatusChange(
    oldPayment: Payment & { user: any },
    newPayment: Payment & { user: any },
    adminUserId?: string
  ): Promise<void> {
    try {
      // If status changed from PENDING to PAID, add credits and send emails
      if (oldPayment.status === 'PENDING' && newPayment.status === 'PAID') {
        await this.markPaymentAsPaid(newPayment.id, newPayment.paymentMethod, newPayment.notes, adminUserId);
        return;
      }

      // If status changed to FAILED or CANCELLED, send notification
      if (newPayment.status === 'FAILED' || newPayment.status === 'CANCELLED') {
        await this.emailService.sendPaymentFailedEmail(newPayment);
        await this.logEmailEvent(
          newPayment.userId,
          newPayment.id,
          'PAYMENT_FAILED',
          newPayment.user.email,
          `Payment ${newPayment.status} - ${newPayment.receiptNumber}`,
          'payment_failed'
        );
      }
    } catch (error) {
      logger.error('Failed to handle status change:', error);
    }
  }

  /**
   * Log email event
   */
  private async logEmailEvent(
    userId: string,
    paymentId: string,
    emailType: string,
    recipient: string,
    subject: string,
    template: string
  ): Promise<void> {
    try {
      await this.prisma.emailLog.create({
        data: {
          userId,
          paymentId,
          emailType,
          recipient,
          subject,
          template,
          status: 'PENDING',
        },
      });
    } catch (error) {
      logger.error('Failed to log email event:', error);
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(paymentId: string, reason?: string, adminUserId?: string): Promise<Payment> {
    try {
      const payment = await this.updatePaymentStatus(
        paymentId,
        {
          status: 'CANCELLED',
          notes: reason ? `Cancelled: ${reason}` : 'Cancelled',
        },
        adminUserId
      );

      logger.info(`Payment ${paymentId} cancelled by ${adminUserId || 'system'}`);
      return payment;
    } catch (error) {
      logger.error(`Failed to cancel payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Get pending payments that need manual review
   */
  async getPendingPayments(limit: number = 50): Promise<Payment[]> {
    try {
      return await this.prisma.payment.findMany({
        where: { status: 'PENDING' },
        include: {
          user: true,
          creditTransactions: true,
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to get pending payments:', error);
      throw error;
    }
  }
}