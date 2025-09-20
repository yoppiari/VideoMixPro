import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import path from 'path';
import { Payment } from '@prisma/client';
import logger from '@/utils/logger';
import moment from 'moment';

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
    this.ensureReceiptsDirectory();
  }

  /**
   * Generate PDF receipt for payment
   */
  async generateReceipt(payment: Payment & { user: any }): Promise<string> {
    try {
      const receiptData: ReceiptData = {
        receiptNumber: payment.receiptNumber,
        customerName: `${payment.user.firstName} ${payment.user.lastName}`,
        customerEmail: payment.user.email,
        amount: payment.amount,
        currency: payment.currency,
        creditsAmount: payment.creditsAmount,
        paymentMethod: payment.paymentMethod || 'Manual Transfer',
        paidAt: payment.paidAt || new Date(),
        notes: payment.notes,
      };

      const filePath = path.join(this.receiptsDir, `Receipt-${payment.receiptNumber}.pdf`);

      await this.createPDFReceipt(receiptData, filePath);

      logger.info(`Receipt generated: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Failed to generate receipt:', error);
      throw error;
    }
  }

  /**
   * Create PDF receipt document
   */
  private async createPDFReceipt(data: ReceiptData, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
        });

        // Pipe to file
        const stream = doc.pipe(fs.createWriteStream(filePath) as any);

        // Company header
        this.addHeader(doc);

        // Receipt title and number
        this.addReceiptTitle(doc, data.receiptNumber);

        // Customer information
        this.addCustomerInfo(doc, data);

        // Payment details
        this.addPaymentDetails(doc, data);

        // Footer
        this.addFooter(doc);

        doc.end();

        stream.on('finish', () => resolve());
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add company header to PDF
   */
  private addHeader(doc: PDFKit.PDFDocument): void {
    // Company logo placeholder (if you have a logo)
    // doc.image('logo.png', 50, 50, { width: 100 });

    // Company information
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('VideoMixPro', 50, 50)
      .fontSize(10)
      .font('Helvetica')
      .text('Professional Video Mixing Platform', 50, 75)
      .text('Email: ' + (process.env.COMPANY_EMAIL || 'support@videomixpro.com'), 50, 90)
      .text('Website: ' + (process.env.COMPANY_WEBSITE || 'www.videomixpro.com'), 50, 105);

    // Current date
    doc
      .text('Receipt Date: ' + moment().format('DD MMMM YYYY'), 400, 75)
      .text('Receipt Time: ' + moment().format('HH:mm:ss'), 400, 90);
  }

  /**
   * Add receipt title and number
   */
  private addReceiptTitle(doc: PDFKit.PDFDocument, receiptNumber: string): void {
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('PAYMENT RECEIPT', 50, 150, { align: 'center' })
      .fontSize(14)
      .font('Helvetica')
      .text(`Receipt Number: ${receiptNumber}`, 50, 180, { align: 'center' });

    // Add a line separator
    doc
      .moveTo(50, 210)
      .lineTo(550, 210)
      .stroke();
  }

  /**
   * Add customer information
   */
  private addCustomerInfo(doc: PDFKit.PDFDocument, data: ReceiptData): void {
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('BILL TO:', 50, 240)
      .font('Helvetica')
      .text(data.customerName, 50, 260)
      .text(data.customerEmail, 50, 275);
  }

  /**
   * Add payment details table
   */
  private addPaymentDetails(doc: PDFKit.PDFDocument, data: ReceiptData): void {
    const startY = 320;
    const leftMargin = 50;
    const rightMargin = 550;

    // Table header
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('PAYMENT DETAILS', leftMargin, startY);

    // Draw table
    const tableTop = startY + 30;
    const itemHeight = 25;
    let currentY = tableTop;

    // Table headers
    doc
      .rect(leftMargin, currentY, rightMargin - leftMargin, itemHeight)
      .stroke()
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Description', leftMargin + 10, currentY + 8)
      .text('Quantity', 300, currentY + 8)
      .text('Amount', 450, currentY + 8);

    currentY += itemHeight;

    // Credit purchase row
    doc
      .rect(leftMargin, currentY, rightMargin - leftMargin, itemHeight)
      .stroke()
      .font('Helvetica')
      .text(`Credits Purchase (${data.creditsAmount} credits)`, leftMargin + 10, currentY + 8)
      .text('1', 300, currentY + 8)
      .text(this.formatCurrency(data.amount, data.currency), 450, currentY + 8);

    currentY += itemHeight + 20;

    // Payment information
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Payment Information:', leftMargin, currentY)
      .font('Helvetica')
      .text(`Payment Method: ${data.paymentMethod}`, leftMargin, currentY + 20)
      .text(`Transaction Date: ${moment(data.paidAt).format('DD MMMM YYYY HH:mm:ss')}`, leftMargin, currentY + 35)
      .text(`Credits Added: ${data.creditsAmount}`, leftMargin, currentY + 50);

    if (data.notes) {
      doc.text(`Notes: ${data.notes}`, leftMargin, currentY + 65);
      currentY += 15;
    }

    currentY += 80;

    // Total section
    const totalBoxY = currentY;
    doc
      .rect(400, totalBoxY, 150, 60)
      .stroke()
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('TOTAL AMOUNT', 410, totalBoxY + 10)
      .fontSize(16)
      .text(this.formatCurrency(data.amount, data.currency), 410, totalBoxY + 30, {
        width: 130,
        align: 'center',
      });
  }

  /**
   * Add footer to PDF
   */
  private addFooter(doc: PDFKit.PDFDocument): void {
    const bottomMargin = 50;
    const pageHeight = doc.page.height;
    const footerY = pageHeight - bottomMargin - 100;

    // Add a line separator
    doc
      .moveTo(50, footerY)
      .lineTo(550, footerY)
      .stroke();

    // Footer text
    doc
      .fontSize(10)
      .font('Helvetica')
      .text('Thank you for your business!', 50, footerY + 20, { align: 'center' })
      .text('This is a computer-generated receipt and does not require a signature.', 50, footerY + 35, { align: 'center' })
      .text('For any questions, please contact our support team.', 50, footerY + 50, { align: 'center' })
      .text(`Contact: ${process.env.SUPPORT_EMAIL || 'support@videomixpro.com'}`, 50, footerY + 65, { align: 'center' });

    // Add receipt generation timestamp
    doc
      .fontSize(8)
      .text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm:ss')}`, 50, footerY + 85, { align: 'right' });
  }

  /**
   * Generate invoice (different from receipt - for pre-payment)
   */
  async generateInvoice(payment: Payment & { user: any }): Promise<string> {
    try {
      const invoiceData = {
        ...payment,
        customerName: `${payment.user.firstName} ${payment.user.lastName}`,
        customerEmail: payment.user.email,
      };

      const filePath = path.join(this.receiptsDir, `Invoice-${payment.receiptNumber}.pdf`);

      await this.createPDFInvoice(invoiceData, filePath);

      logger.info(`Invoice generated: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Failed to generate invoice:', error);
      throw error;
    }
  }

  /**
   * Create PDF invoice document (for pending payments)
   */
  private async createPDFInvoice(data: any, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
        });

        const stream = doc.pipe(fs.createWriteStream(filePath) as any);

        // Similar to receipt but with "INVOICE" title and pending status
        this.addHeader(doc);

        // Invoice title and number
        doc
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('INVOICE', 50, 150, { align: 'center' })
          .fontSize(14)
          .font('Helvetica')
          .text(`Invoice Number: ${data.receiptNumber}`, 50, 180, { align: 'center' })
          .fontSize(12)
          .fillColor('orange')
          .text('STATUS: PENDING PAYMENT', 50, 200, { align: 'center' })
          .fillColor('black');

        // Add a line separator
        doc
          .moveTo(50, 230)
          .lineTo(550, 230)
          .stroke();

        // Customer info
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('BILL TO:', 50, 260)
          .font('Helvetica')
          .text(data.customerName, 50, 280)
          .text(data.customerEmail, 50, 295);

        // Payment details (similar to receipt but shows as pending)
        const startY = 340;
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('PAYMENT DETAILS', 50, startY)
          .font('Helvetica')
          .text(`Credits to be added: ${data.creditsAmount}`, 50, startY + 30)
          .text(`Amount: ${this.formatCurrency(data.amount, data.currency)}`, 50, startY + 50)
          .text(`Payment Method: ${data.paymentMethod || 'Manual Transfer'}`, 50, startY + 70)
          .text(`Invoice Date: ${moment(data.createdAt).format('DD MMMM YYYY')}`, 50, startY + 90);

        // Payment instructions
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('PAYMENT INSTRUCTIONS:', 50, startY + 130)
          .font('Helvetica')
          .text('Please make payment using your preferred method and contact our support team', 50, startY + 150)
          .text('with your payment confirmation. Credits will be added once payment is confirmed.', 50, startY + 165);

        this.addFooter(doc);

        doc.end();

        stream.on('finish', () => resolve());
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get receipt file path
   */
  getReceiptPath(receiptNumber: string): string {
    return path.join(this.receiptsDir, `Receipt-${receiptNumber}.pdf`);
  }

  /**
   * Get invoice file path
   */
  getInvoicePath(receiptNumber: string): string {
    return path.join(this.receiptsDir, `Invoice-${receiptNumber}.pdf`);
  }

  /**
   * Check if receipt exists
   */
  async receiptExists(receiptNumber: string): Promise<boolean> {
    try {
      const filePath = this.getReceiptPath(receiptNumber);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete receipt file
   */
  async deleteReceipt(receiptNumber: string): Promise<void> {
    try {
      const filePath = this.getReceiptPath(receiptNumber);
      await fs.unlink(filePath);
      logger.info(`Receipt deleted: ${filePath}`);
    } catch (error) {
      logger.warn(`Failed to delete receipt ${receiptNumber}:`, error);
    }
  }

  /**
   * Ensure receipts directory exists
   */
  private async ensureReceiptsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.receiptsDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create receipts directory:', error);
    }
  }

  /**
   * Format currency for display
   */
  private formatCurrency(amount: number, currency: string = 'IDR'): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  /**
   * Clean up old receipts (older than specified days)
   */
  async cleanupOldReceipts(daysOld: number = 365): Promise<void> {
    try {
      const files = await fs.readdir(this.receiptsDir);
      const cutoffDate = moment().subtract(daysOld, 'days').toDate();

      for (const file of files) {
        if (file.endsWith('.pdf')) {
          const filePath = path.join(this.receiptsDir, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            logger.info(`Cleaned up old receipt: ${file}`);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old receipts:', error);
    }
  }
}