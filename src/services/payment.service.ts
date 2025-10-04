/*
 * TEMPORARILY DISABLED: Payment service
 * Reason: Payment model is not defined in schema.prisma
 * This service will be re-enabled when Payment model is added to the database schema
 * Missing models: Payment
 * Date disabled: 2025-10-04
 */

import { PrismaClient } from '@prisma/client';
import logger from '@/utils/logger';

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

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // All methods throw errors
  async createPayment(): Promise<any> {
    logger.error('PaymentService.createPayment disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }

  async updatePaymentStatus(): Promise<any> {
    logger.error('PaymentService.updatePaymentStatus disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }

  async markPaymentAsPaid(): Promise<any> {
    logger.error('PaymentService.markPaymentAsPaid disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }

  async getPaymentById(): Promise<any> {
    logger.error('PaymentService.getPaymentById disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }

  async getPaymentByReceiptNumber(): Promise<any> {
    logger.error('PaymentService.getPaymentByReceiptNumber disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }

  async getUserPayments(): Promise<any> {
    logger.error('PaymentService.getUserPayments disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }

  async getAllPayments(): Promise<any> {
    logger.error('PaymentService.getAllPayments disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }

  async getPaymentStats(): Promise<PaymentStats> {
    logger.error('PaymentService.getPaymentStats disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }

  async cancelPayment(): Promise<any> {
    logger.error('PaymentService.cancelPayment disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }

  async getPendingPayments(): Promise<any> {
    logger.error('PaymentService.getPendingPayments disabled - missing Payment model');
    throw new Error('Payment features temporarily unavailable');
  }
}
