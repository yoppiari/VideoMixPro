/*
 * TEMPORARILY DISABLED: Email service
 * Reason: Payment and EmailLog models are not defined in schema.prisma
 * This service will be re-enabled when the missing models are added to the database schema
 * Missing models: Payment, EmailLog
 * Date disabled: 2025-10-04
 */

import nodemailer from 'nodemailer';
import logger from '@/utils/logger';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const emailConfig: EmailConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    };

    this.transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: emailConfig.auth,
    });

    logger.info('Email service initialized (limited mode - Payment model unavailable)');
  }

  // All payment-related methods disabled
  async sendPaymentCreatedEmail(): Promise<void> {
    logger.error('sendPaymentCreatedEmail disabled - missing Payment model');
    throw new Error('Payment email features temporarily unavailable');
  }

  async sendPaymentConfirmedEmail(): Promise<void> {
    logger.error('sendPaymentConfirmedEmail disabled - missing Payment model');
    throw new Error('Payment email features temporarily unavailable');
  }

  async sendPaymentFailedEmail(): Promise<void> {
    logger.error('sendPaymentFailedEmail disabled - missing Payment model');
    throw new Error('Payment email features temporarily unavailable');
  }

  async sendReceiptEmail(): Promise<void> {
    logger.error('sendReceiptEmail disabled - missing Payment model');
    throw new Error('Payment email features temporarily unavailable');
  }

  async sendCreditsLowEmail(user: any, stats: any): Promise<void> {
    logger.warn('sendCreditsLowEmail partially available');
    // This could work but skipping for now
  }

  async sendWelcomeEmail(user: any): Promise<void> {
    logger.warn('sendWelcomeEmail partially available');
    // This could work but skipping for now
  }

  async sendPasswordResetEmail(user: any, resetUrl: string, requestTime: Date, ipAddress: string): Promise<void> {
    logger.warn('sendPasswordResetEmail partially available');
    // This could work but skipping for now
  }

  async sendAdminPaymentNotification(): Promise<void> {
    logger.error('sendAdminPaymentNotification disabled - missing Payment model');
    throw new Error('Payment email features temporarily unavailable');
  }

  async testEmailConfiguration(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email configuration is valid');
      return true;
    } catch (error) {
      logger.error('Email configuration test failed:', error);
      return false;
    }
  }
}
