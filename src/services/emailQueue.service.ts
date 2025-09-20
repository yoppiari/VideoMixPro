import Bull, { Queue, Job, JobOptions } from 'bull';
import { EmailService } from './email.service';
import { EmailTemplateData, EmailTemplateType } from './emailTemplate.service';
import logger from '@/utils/logger';
import { database } from '@/utils/database';
import { createQueue, QueueNames } from '@/utils/queue';

export interface EmailJobData {
  templateType: EmailTemplateType;
  templateData: EmailTemplateData;
  to: string;
  priority?: number;
  delay?: number;
  retryAttempts?: number;
  metadata?: Record<string, any>;
}

export interface BulkEmailJobData {
  templateType: EmailTemplateType;
  templateData: EmailTemplateData;
  recipients: string[];
  priority?: number;
  delay?: number;
  batchSize?: number;
}

export interface EmailJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sentAt: Date;
  recipient: string;
}

class EmailQueueService {
  private queue: Queue<EmailJobData>;
  private bulkQueue: Queue<BulkEmailJobData>;
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
    this.initializeQueues();
    this.setupProcessors();
  }

  /**
   * Initialize Bull queues using QueueAdapter
   */
  private initializeQueues(): void {
    // Use the QueueAdapter to auto-switch between Redis and in-memory
    this.queue = createQueue('email-queue', {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }) as Queue<EmailJobData>;

    this.bulkQueue = createQueue('bulk-email-queue', {
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: 50,
        removeOnFail: 25,
      },
    }) as Queue<BulkEmailJobData>;

    logger.info('Email queues initialized');
  }

  /**
   * Setup queue processors
   */
  private setupProcessors(): void {
    // Single email processor
    this.queue.process('send-email', 5, async (job: Job<EmailJobData>) => {
      return this.processSingleEmail(job);
    });

    // Bulk email processor
    this.bulkQueue.process('send-bulk-email', 2, async (job: Job<BulkEmailJobData>) => {
      return this.processBulkEmail(job);
    });

    // Event listeners for monitoring
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for queue monitoring
   */
  private setupEventListeners(): void {
    // Single email queue events
    this.queue.on('completed', (job: Job<EmailJobData>, result: EmailJobResult) => {
      logger.info(`Email job ${job.id} completed for ${result.recipient}`);
      this.updateEmailLog(job.data.to, job.data.templateType, 'SENT');
    });

    this.queue.on('failed', (job: Job<EmailJobData>, err: Error) => {
      logger.error(`Email job ${job.id} failed for ${job.data.to}:`, err);
      this.updateEmailLog(job.data.to, job.data.templateType, 'FAILED', err.message);
    });

    this.queue.on('stalled', (job: Job<EmailJobData>) => {
      logger.warn(`Email job ${job.id} stalled for ${job.data.to}`);
    });

    // Bulk email queue events
    this.bulkQueue.on('completed', (job: Job<BulkEmailJobData>, result: any) => {
      logger.info(`Bulk email job ${job.id} completed for ${job.data.recipients.length} recipients`);
    });

    this.bulkQueue.on('failed', (job: Job<BulkEmailJobData>, err: Error) => {
      logger.error(`Bulk email job ${job.id} failed:`, err);
    });
  }

  /**
   * Process single email job
   */
  private async processSingleEmail(job: Job<EmailJobData>): Promise<EmailJobResult> {
    const { templateType, templateData, to, metadata } = job.data;

    try {
      // Use specific email service methods based on template type
      switch (templateType) {
        case 'payment_created':
          await this.emailService.sendPaymentCreatedEmail(templateData.payment as any);
          break;
        case 'payment_confirmed':
          await this.emailService.sendPaymentConfirmedEmail(templateData.payment as any);
          break;
        case 'payment_failed':
          await this.emailService.sendPaymentFailedEmail(templateData.payment as any);
          break;
        case 'receipt_delivery':
          if (metadata?.receiptPath) {
            await this.emailService.sendReceiptEmail(templateData.payment as any, metadata.receiptPath);
          }
          break;
        case 'credits_low':
          await this.emailService.sendCreditsLowEmail(templateData.user, templateData.stats);
          break;
        case 'welcome':
          await this.emailService.sendWelcomeEmail(templateData.user);
          break;
        case 'password_reset':
          await this.emailService.sendPasswordResetEmail(
            templateData.user,
            templateData.resetUrl!,
            templateData.requestTime!,
            templateData.ipAddress!
          );
          break;
        default:
          throw new Error(`Unsupported template type: ${templateType}`);
      }

      return {
        success: true,
        sentAt: new Date(),
        recipient: to,
      };
    } catch (error) {
      throw new Error(`Failed to send ${templateType} email to ${to}: ${(error as any).message}`);
    }
  }

  /**
   * Process bulk email job
   */
  private async processBulkEmail(job: Job<BulkEmailJobData>): Promise<any> {
    const { templateType, templateData, recipients, batchSize = 10 } = job.data;

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process recipients in batches
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchPromises = batch.map(async (recipient) => {
        try {
          await this.addEmailToQueue(templateType, {
            ...templateData,
            user: { ...templateData.user, email: recipient },
          }, {
            priority: 1, // Lower priority for bulk emails
            delay: i * 1000, // Stagger emails to avoid overwhelming SMTP
          });
          results.sent++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${recipient}: ${(error as any).message}`);
        }
      });

      await Promise.allSettled(batchPromises);

      // Update job progress
      const progress = Math.round(((i + batch.length) / recipients.length) * 100);
      await job.progress(progress);

      // Small delay between batches
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return results;
  }

  /**
   * Add email to queue
   */
  async addEmailToQueue(
    templateType: EmailTemplateType,
    templateData: EmailTemplateData,
    options: {
      priority?: number;
      delay?: number;
      retryAttempts?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<Job<EmailJobData>> {
    const jobData: EmailJobData = {
      templateType,
      templateData,
      to: templateData.user.email,
      priority: options.priority || 5,
      delay: options.delay || 0,
      retryAttempts: options.retryAttempts || 3,
      metadata: options.metadata,
    };

    const jobOptions: JobOptions = {
      priority: jobData.priority,
      delay: jobData.delay,
      attempts: jobData.retryAttempts,
    };

    const job = await this.queue.add('send-email', jobData, jobOptions);

    logger.info(`Email job ${job.id} added to queue: ${templateType} to ${templateData.user.email}`);
    return job;
  }

  /**
   * Add bulk email to queue
   */
  async addBulkEmailToQueue(
    templateType: EmailTemplateType,
    templateData: EmailTemplateData,
    recipients: string[],
    options: {
      priority?: number;
      delay?: number;
      batchSize?: number;
    } = {}
  ): Promise<Job<BulkEmailJobData>> {
    const jobData: BulkEmailJobData = {
      templateType,
      templateData,
      recipients,
      priority: options.priority || 3,
      delay: options.delay || 0,
      batchSize: options.batchSize || 10,
    };

    const jobOptions: JobOptions = {
      priority: jobData.priority,
      delay: jobData.delay,
      attempts: 2,
    };

    const job = await this.bulkQueue.add('send-bulk-email', jobData, jobOptions);

    logger.info(`Bulk email job ${job.id} added to queue: ${templateType} to ${recipients.length} recipients`);
    return job;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    email: any;
    bulkEmail: any;
  }> {
    const [emailStats, bulkEmailStats] = await Promise.all([
      {
        waiting: await this.queue.getWaiting().then(jobs => jobs.length),
        active: await this.queue.getActive().then(jobs => jobs.length),
        completed: await this.queue.getCompleted().then(jobs => jobs.length),
        failed: await this.queue.getFailed().then(jobs => jobs.length),
        delayed: await this.queue.getDelayed().then(jobs => jobs.length),
      },
      {
        waiting: await this.bulkQueue.getWaiting().then(jobs => jobs.length),
        active: await this.bulkQueue.getActive().then(jobs => jobs.length),
        completed: await this.bulkQueue.getCompleted().then(jobs => jobs.length),
        failed: await this.bulkQueue.getFailed().then(jobs => jobs.length),
        delayed: await this.bulkQueue.getDelayed().then(jobs => jobs.length),
      },
    ]);

    return {
      email: emailStats,
      bulkEmail: bulkEmailStats,
    };
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs(queueType: 'email' | 'bulk' = 'email'): Promise<number> {
    const targetQueue = queueType === 'email' ? this.queue : this.bulkQueue;
    const failedJobs = await targetQueue.getFailed();

    let retriedCount = 0;
    for (const job of failedJobs) {
      try {
        await job.retry();
        retriedCount++;
      } catch (error) {
        logger.error(`Failed to retry job ${job.id}:`, error);
      }
    }

    logger.info(`Retried ${retriedCount} failed ${queueType} jobs`);
    return retriedCount;
  }

  /**
   * Clean old jobs
   */
  async cleanOldJobs(): Promise<void> {
    const gracePeriod = 24 * 60 * 60 * 1000; // 24 hours

    await Promise.all([
      this.queue.clean(gracePeriod, 'completed'),
      this.queue.clean(gracePeriod, 'failed'),
      this.bulkQueue.clean(gracePeriod, 'completed'),
      this.bulkQueue.clean(gracePeriod, 'failed'),
    ]);

    logger.info('Cleaned old email queue jobs');
  }

  /**
   * Pause/Resume queues
   */
  async pauseQueues(): Promise<void> {
    await Promise.all([
      this.queue.pause(),
      this.bulkQueue.pause(),
    ]);
    logger.info('Email queues paused');
  }

  async resumeQueues(): Promise<void> {
    await Promise.all([
      this.queue.resume(),
      this.bulkQueue.resume(),
    ]);
    logger.info('Email queues resumed');
  }

  /**
   * Update email log in database
   */
  private async updateEmailLog(
    email: string,
    emailType: string,
    status: 'SENT' | 'FAILED',
    errorMessage?: string
  ): Promise<void> {
    try {
      const prisma = database.getPrisma();
      await prisma.emailLog.create({
        data: {
          email,
          emailType,
          subject: `${emailType} email`,
          status,
          errorMessage,
          sentAt: status === 'SENT' ? new Date() : null,
        },
      });
    } catch (error) {
      logger.error('Failed to update email log:', error);
    }
  }

  /**
   * Get queue health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    details: any;
  }> {
    try {
      const stats = await this.getQueueStats();
      const totalFailed = stats.email.failed + stats.bulkEmail.failed;
      const totalActive = stats.email.active + stats.bulkEmail.active;
      const totalWaiting = stats.email.waiting + stats.bulkEmail.waiting;

      let status: 'healthy' | 'warning' | 'error' = 'healthy';

      if (totalFailed > 10) {
        status = 'error';
      } else if (totalFailed > 5 || totalWaiting > 50) {
        status = 'warning';
      }

      return {
        status,
        details: {
          stats,
          totalFailed,
          totalActive,
          totalWaiting,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        details: { error: (error as any).message },
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down email queues...');
    await Promise.all([
      this.queue.close(),
      this.bulkQueue.close(),
    ]);
    logger.info('Email queues shut down successfully');
  }
}

export const emailQueueService = new EmailQueueService();
export default emailQueueService;