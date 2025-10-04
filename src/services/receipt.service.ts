/*
 * TEMPORARILY DISABLED: Receipt service
 * Reason: Payment model is not defined in schema.prisma
 * This service will be re-enabled when Payment model is added to the database schema
 * Missing models: Payment
 * Date disabled: 2025-10-04
 */

import path from 'path';
import logger from '@/utils/logger';

export interface ReceiptData {
  receiptNumber: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  creditsAmount: number;
  paymentMethod: string;
  paidAt: Date;
  notes?: string;
}

export class ReceiptService {
  private receiptsDir: string;

  constructor() {
    this.receiptsDir = path.join(process.cwd(), 'receipts');
    logger.info('ReceiptService initialized (disabled - Payment model unavailable)');
  }

  async generateReceipt(): Promise<string> {
    logger.error('generateReceipt disabled - missing Payment model');
    throw new Error('Receipt features temporarily unavailable');
  }

  async generateInvoice(): Promise<string> {
    logger.error('generateInvoice disabled - missing Payment model');
    throw new Error('Receipt features temporarily unavailable');
  }

  getReceiptPath(receiptNumber: string): string {
    return path.join(this.receiptsDir, `Receipt-${receiptNumber}.pdf`);
  }

  getInvoicePath(receiptNumber: string): string {
    return path.join(this.receiptsDir, `Invoice-${receiptNumber}.pdf`);
  }

  async receiptExists(): Promise<boolean> {
    return false;
  }

  async deleteReceipt(): Promise<void> {
    logger.warn('deleteReceipt disabled');
  }

  async cleanupOldReceipts(): Promise<void> {
    logger.warn('cleanupOldReceipts disabled');
  }
}
