import nodemailer from 'nodemailer';
import { Payment } from '@prisma/client';
import logger from '@/utils/logger';
import emailTemplateService, { EmailTemplateData, EmailTemplateType } from './emailTemplate.service';
import { database } from '@/utils/database';

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

  /**
   * Initialize email transporter
   */
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

    logger.info('Email service initialized');
  }

  /**
   * Send payment created email
   */
  async sendPaymentCreatedEmail(payment: Payment & { user: any }): Promise<void> {
    try {
      const templateData: EmailTemplateData = {
        user: {
          id: payment.user.id,
          email: payment.user.email,
          firstName: payment.user.firstName,
          lastName: payment.user.lastName,
          credits: payment.user.credits || 0,
          licenseType: payment.user.licenseType || 'FREE',
          createdAt: payment.user.createdAt,
        },
        payment: {
          id: payment.id,
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          credits: payment.creditsAmount,
          status: payment.status,
          paymentMethod: payment.paymentMethod || 'Manual Transfer',
          notes: payment.notes,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      };

      const { html, subject } = await emailTemplateService.renderTemplate('payment_created', templateData);

      await this.sendEmail({
        to: payment.user.email,
        subject,
        html,
      });

      await this.logEmail(payment.user.email, 'PAYMENT_CREATED', subject, 'SENT');
      logger.info(`Payment created email sent to ${payment.user.email}`);
    } catch (error) {
      await this.logEmail(payment.user.email, 'PAYMENT_CREATED', 'Payment Created', 'FAILED', error.message);
      logger.error('Failed to send payment created email:', error);
      throw error;
    }
  }

  /**
   * Send payment confirmed email
   */
  async sendPaymentConfirmedEmail(payment: Payment & { user: any }): Promise<void> {
    try {
      const templateData: EmailTemplateData = {
        user: {
          id: payment.user.id,
          email: payment.user.email,
          firstName: payment.user.firstName,
          lastName: payment.user.lastName,
          credits: payment.user.credits || 0,
          licenseType: payment.user.licenseType || 'FREE',
          createdAt: payment.user.createdAt,
        },
        payment: {
          id: payment.id,
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          credits: payment.creditsAmount,
          status: payment.status,
          paymentMethod: payment.paymentMethod || 'Manual Transfer',
          notes: payment.notes,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      };

      const { html, subject } = await emailTemplateService.renderTemplate('payment_confirmed', templateData);

      await this.sendEmail({
        to: payment.user.email,
        subject,
        html,
      });

      await this.logEmail(payment.user.email, 'PAYMENT_CONFIRMED', subject, 'SENT');
      logger.info(`Payment confirmed email sent to ${payment.user.email}`);
    } catch (error) {
      await this.logEmail(payment.user.email, 'PAYMENT_CONFIRMED', 'Payment Confirmed', 'FAILED', error.message);
      logger.error('Failed to send payment confirmed email:', error);
      throw error;
    }
  }

  /**
   * Send payment failed email
   */
  async sendPaymentFailedEmail(payment: Payment & { user: any }): Promise<void> {
    try {
      const templateData: EmailTemplateData = {
        user: {
          id: payment.user.id,
          email: payment.user.email,
          firstName: payment.user.firstName,
          lastName: payment.user.lastName,
          credits: payment.user.credits || 0,
          licenseType: payment.user.licenseType || 'FREE',
          createdAt: payment.user.createdAt,
        },
        payment: {
          id: payment.id,
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          credits: payment.creditsAmount,
          status: payment.status,
          paymentMethod: payment.paymentMethod || 'Manual Transfer',
          notes: payment.notes,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      };

      const { html, subject } = await emailTemplateService.renderTemplate('payment_failed', templateData);

      await this.sendEmail({
        to: payment.user.email,
        subject,
        html,
      });

      await this.logEmail(payment.user.email, 'PAYMENT_FAILED', subject, 'SENT');
      logger.info(`Payment ${payment.status} email sent to ${payment.user.email}`);
    } catch (error) {
      await this.logEmail(payment.user.email, 'PAYMENT_FAILED', 'Payment Failed', 'FAILED', error.message);
      logger.error('Failed to send payment failed email:', error);
      throw error;
    }
  }

  /**
   * Send receipt email with PDF attachment
   */
  async sendReceiptEmail(payment: Payment & { user: any }, receiptPath: string): Promise<void> {
    try {
      const templateData: EmailTemplateData = {
        user: {
          id: payment.user.id,
          email: payment.user.email,
          firstName: payment.user.firstName,
          lastName: payment.user.lastName,
          credits: payment.user.credits || 0,
          licenseType: payment.user.licenseType || 'FREE',
          createdAt: payment.user.createdAt,
        },
        payment: {
          id: payment.id,
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          credits: payment.creditsAmount,
          status: payment.status,
          paymentMethod: payment.paymentMethod || 'Manual Transfer',
          notes: payment.notes,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      };

      const { html, subject } = await emailTemplateService.renderTemplate('receipt_delivery', templateData);

      await this.sendEmail({
        to: payment.user.email,
        subject,
        html,
        attachments: [
          {
            filename: `Receipt-${payment.receiptNumber}.pdf`,
            path: receiptPath,
            contentType: 'application/pdf',
          },
        ],
      });

      await this.logEmail(payment.user.email, 'RECEIPT_DELIVERY', subject, 'SENT');
      logger.info(`Receipt email sent to ${payment.user.email}`);
    } catch (error) {
      await this.logEmail(payment.user.email, 'RECEIPT_DELIVERY', 'Receipt Delivery', 'FAILED', error.message);
      logger.error('Failed to send receipt email:', error);
      throw error;
    }
  }

  /**
   * Send credits low warning email
   */
  async sendCreditsLowEmail(user: any, stats: any): Promise<void> {
    try {
      const templateData: EmailTemplateData = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          credits: user.credits || 0,
          licenseType: user.licenseType || 'FREE',
          createdAt: user.createdAt,
        },
        stats,
      };

      const { html, subject } = await emailTemplateService.renderTemplate('credits_low', templateData);

      await this.sendEmail({
        to: user.email,
        subject,
        html,
      });

      await this.logEmail(user.email, 'CREDITS_LOW', subject, 'SENT');
      logger.info(`Credits low email sent to ${user.email}`);
    } catch (error) {
      await this.logEmail(user.email, 'CREDITS_LOW', 'Credits Low Warning', 'FAILED', error.message);
      logger.error('Failed to send credits low email:', error);
      throw error;
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(user: any): Promise<void> {
    try {
      const templateData: EmailTemplateData = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          credits: user.credits || 0,
          licenseType: user.licenseType || 'FREE',
          createdAt: user.createdAt,
        },
      };

      const { html, subject } = await emailTemplateService.renderTemplate('welcome', templateData);

      await this.sendEmail({
        to: user.email,
        subject,
        html,
      });

      await this.logEmail(user.email, 'WELCOME', subject, 'SENT');
      logger.info(`Welcome email sent to ${user.email}`);
    } catch (error) {
      await this.logEmail(user.email, 'WELCOME', 'Welcome to VideoMixPro', 'FAILED', error.message);
      logger.error('Failed to send welcome email:', error);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user: any, resetUrl: string, requestTime: Date, ipAddress: string): Promise<void> {
    try {
      const templateData: EmailTemplateData = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          credits: user.credits || 0,
          licenseType: user.licenseType || 'FREE',
          createdAt: user.createdAt,
        },
        resetUrl,
        requestTime,
        ipAddress,
      };

      const { html, subject } = await emailTemplateService.renderTemplate('password_reset', templateData);

      await this.sendEmail({
        to: user.email,
        subject,
        html,
      });

      await this.logEmail(user.email, 'PASSWORD_RESET', subject, 'SENT');
      logger.info(`Password reset email sent to ${user.email}`);
    } catch (error) {
      await this.logEmail(user.email, 'PASSWORD_RESET', 'Password Reset', 'FAILED', error.message);
      logger.error('Failed to send password reset email:', error);
      throw error;
    }
  }

  /**
   * Send admin notification for new payment
   */
  async sendAdminPaymentNotification(payment: Payment & { user: any }): Promise<void> {
    try {
      const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
      if (adminEmails.length === 0) {
        logger.warn('No admin emails configured for payment notifications');
        return;
      }

      for (const adminEmail of adminEmails) {
        await this.sendEmail({
          to: adminEmail.trim(),
          subject: `New Payment - ${payment.receiptNumber}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>New Payment Notification</h2>
              <p>A new payment has been created and requires review.</p>
              <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
                <h3>Payment Details:</h3>
                <p><strong>Receipt Number:</strong> ${payment.receiptNumber}</p>
                <p><strong>Customer:</strong> ${payment.user.firstName} ${payment.user.lastName} (${payment.user.email})</p>
                <p><strong>Amount:</strong> ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(payment.amount)}</p>
                <p><strong>Credits:</strong> ${payment.creditsAmount}</p>
                <p><strong>Status:</strong> ${payment.status}</p>
                <p><strong>Created:</strong> ${payment.createdAt.toLocaleString('id-ID')}</p>
              </div>
              <p><a href="${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3002/admin'}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Dashboard</a></p>
            </div>
          `,
        });
      }

      logger.info(`Admin payment notification sent for ${payment.receiptNumber}`);
    } catch (error) {
      logger.error('Failed to send admin payment notification:', error);
      throw error;
    }
  }

  /**
   * Send generic email
   */
  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: any[];
  }): Promise<void> {
    try {
      const mailOptions = {
        from: `${process.env.FROM_NAME || 'VideoMixPro'} <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  /**
   * Log email activity to database
   */
  private async logEmail(
    email: string,
    emailType: string,
    subject: string,
    status: 'SENT' | 'FAILED',
    errorMessage?: string
  ): Promise<void> {
    try {
      const prisma = database.getPrisma();
      await prisma.emailLog.create({
        data: {
          email,
          emailType,
          subject,
          status,
          errorMessage,
          sentAt: status === 'SENT' ? new Date() : null,
        },
      });
    } catch (error) {
      logger.error('Failed to log email activity:', error);
    }
  }


  /**
   * Test email configuration
   */
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