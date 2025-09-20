import { JobStatus } from '@/types';
import { database, prisma } from '@/utils/database';
import logger from '@/utils/logger';
import { ErrorHandlingService, ErrorType, ErrorSeverity } from './error-handling.service';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
  backoffMultiplier: number;
  jitterEnabled: boolean;
  retryableErrorTypes: ErrorType[];
}

export interface RetryAttempt {
  id: string;
  jobId: string;
  attemptNumber: number;
  errorType: ErrorType;
  errorMessage: string;
  scheduledAt: Date;
  executedAt?: Date;
  successful: boolean;
  finalAttempt: boolean;
  nextRetryAt?: Date;
}

export class RetryService {
  private errorHandlingService: ErrorHandlingService;
  private retryQueue = new Map<string, RetryAttempt>();
  private retryTimers = new Map<string, NodeJS.Timeout>();

  private defaultConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 5000, // 5 seconds
    maxDelay: 300000, // 5 minutes
    backoffMultiplier: 2,
    jitterEnabled: true,
    retryableErrorTypes: [
      ErrorType.INPUT_FILE_NOT_FOUND,
      ErrorType.CORRUPTED_INPUT_FILE,
      ErrorType.INSUFFICIENT_DISK_SPACE,
      ErrorType.PERMISSION_DENIED,
      ErrorType.INVALID_FILTER_GRAPH,
      ErrorType.OUTPUT_ALREADY_EXISTS,
      ErrorType.NETWORK_ERROR,
      ErrorType.TIMEOUT_ERROR,
      ErrorType.UNKNOWN_ERROR
    ]
  };

  constructor(errorHandlingService: ErrorHandlingService) {
    this.errorHandlingService = errorHandlingService;
    this.loadPendingRetries();
  }

  /**
   * Schedule a job for retry based on error analysis
   */
  async scheduleRetry(
    jobId: string,
    error: Error,
    context: {
      operation: string;
      inputFiles?: string[];
      outputFile?: string;
      command?: string;
    },
    customConfig?: Partial<RetryConfig>
  ): Promise<boolean> {
    try {
      // Analyze the error first
      const processingError = this.errorHandlingService.analyzeError(error, context);

      // Check if error is retryable
      if (!this.errorHandlingService.shouldRetry(processingError.id)) {
        logger.info(`Error ${processingError.id} is not retryable`);
        await this.markJobAsFailed(jobId, processingError.id);
        return false;
      }

      const config = { ...this.defaultConfig, ...customConfig };

      // Check if we haven't exceeded max retries
      const currentAttempts = await this.getRetryAttempts(jobId);
      if (currentAttempts.length >= config.maxRetries) {
        logger.info(`Max retries (${config.maxRetries}) exceeded for job ${jobId}`);
        await this.markJobAsFailed(jobId, processingError.id);
        return false;
      }

      // Calculate delay for next retry
      const retryDelay = this.calculateRetryDelay(
        currentAttempts.length,
        config,
        this.errorHandlingService.getRetryDelay(processingError.id)
      );

      // Create retry attempt record
      const retryAttempt: RetryAttempt = {
        id: this.generateRetryId(),
        jobId,
        attemptNumber: currentAttempts.length + 1,
        errorType: processingError.type,
        errorMessage: error.message,
        scheduledAt: new Date(),
        successful: false,
        finalAttempt: currentAttempts.length + 1 >= config.maxRetries,
        nextRetryAt: new Date(Date.now() + retryDelay)
      };

      // Store retry attempt
      this.retryQueue.set(retryAttempt.id, retryAttempt);
      await this.persistRetryAttempt(retryAttempt);

      // Schedule the actual retry
      this.scheduleRetryExecution(retryAttempt, retryDelay);

      // Record recovery attempt in error service
      this.errorHandlingService.recordRecoveryAttempt(processingError.id);

      logger.info(`Scheduled retry for job ${jobId}, attempt ${retryAttempt.attemptNumber}/${config.maxRetries}, delay: ${retryDelay}ms`);

      return true;
    } catch (error) {
      logger.error('Failed to schedule retry:', error);
      return false;
    }
  }

  /**
   * Cancel all pending retries for a job
   */
  async cancelRetries(jobId: string): Promise<void> {
    try {
      // Cancel timers
      for (const [retryId, retryAttempt] of this.retryQueue) {
        if (retryAttempt.jobId === jobId && !retryAttempt.executedAt) {
          const timer = this.retryTimers.get(retryId);
          if (timer) {
            clearTimeout(timer);
            this.retryTimers.delete(retryId);
          }
          this.retryQueue.delete(retryId);
        }
      }

      // Update database
      await this.cancelPendingRetries(jobId);

      logger.info(`Cancelled all pending retries for job ${jobId}`);
    } catch (error) {
      logger.error(`Failed to cancel retries for job ${jobId}:`, error);
    }
  }

  /**
   * Get retry statistics for a job
   */
  async getRetryStatistics(jobId: string): Promise<{
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    pendingAttempts: number;
    lastAttemptAt?: Date;
    nextRetryAt?: Date;
  }> {
    const attempts = await this.getRetryAttempts(jobId);

    const stats = {
      totalAttempts: attempts.length,
      successfulAttempts: attempts.filter(a => a.successful).length,
      failedAttempts: attempts.filter(a => a.executedAt && !a.successful).length,
      pendingAttempts: attempts.filter(a => !a.executedAt).length,
      lastAttemptAt: undefined as Date | undefined,
      nextRetryAt: undefined as Date | undefined
    };

    // Find last attempt date
    const executedAttempts = attempts.filter(a => a.executedAt);
    if (executedAttempts.length > 0) {
      stats.lastAttemptAt = new Date(Math.max(...executedAttempts.map(a => a.executedAt!.getTime())));
    }

    // Find next retry date
    const pendingAttempts = attempts.filter(a => !a.executedAt && a.nextRetryAt);
    if (pendingAttempts.length > 0) {
      stats.nextRetryAt = new Date(Math.min(...pendingAttempts.map(a => a.nextRetryAt!.getTime())));
    }

    return stats;
  }

  /**
   * Get global retry statistics
   */
  getGlobalRetryStatistics(): {
    activeRetries: number;
    queuedRetries: number;
    recentSuccessRate: number;
    averageRetryDelay: number;
  } {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    let activeRetries = 0;
    let queuedRetries = 0;
    let recentAttempts = 0;
    let recentSuccessful = 0;
    let totalDelay = 0;
    let delayCount = 0;

    for (const retry of this.retryQueue.values()) {
      if (!retry.executedAt) {
        if (retry.nextRetryAt && retry.nextRetryAt <= now) {
          activeRetries++;
        } else {
          queuedRetries++;
        }
      }

      if (retry.scheduledAt > oneHourAgo) {
        recentAttempts++;
        if (retry.successful) {
          recentSuccessful++;
        }
      }

      if (retry.nextRetryAt && retry.scheduledAt) {
        const delay = retry.nextRetryAt.getTime() - retry.scheduledAt.getTime();
        totalDelay += delay;
        delayCount++;
      }
    }

    return {
      activeRetries,
      queuedRetries,
      recentSuccessRate: recentAttempts > 0 ? recentSuccessful / recentAttempts : 0,
      averageRetryDelay: delayCount > 0 ? totalDelay / delayCount : 0
    };
  }

  private calculateRetryDelay(
    attemptNumber: number,
    config: RetryConfig,
    errorSpecificDelay?: number
  ): number {
    // Use error-specific delay if provided, otherwise use exponential backoff
    let delay = errorSpecificDelay || config.baseDelay * Math.pow(config.backoffMultiplier, attemptNumber);

    // Apply jitter if enabled
    if (config.jitterEnabled) {
      const jitter = Math.random() * delay * 0.1; // 10% jitter
      delay += jitter;
    }

    // Ensure delay doesn't exceed maximum
    return Math.min(delay, config.maxDelay);
  }

  private scheduleRetryExecution(retryAttempt: RetryAttempt, delay: number): void {
    const timer = setTimeout(async () => {
      try {
        await this.executeRetry(retryAttempt);
      } catch (error) {
        logger.error(`Failed to execute retry ${retryAttempt.id}:`, error);
      } finally {
        this.retryTimers.delete(retryAttempt.id);
      }
    }, delay);

    this.retryTimers.set(retryAttempt.id, timer);
  }

  private async executeRetry(retryAttempt: RetryAttempt): Promise<void> {
    try {
      logger.info(`Executing retry ${retryAttempt.id} for job ${retryAttempt.jobId}`);

      // Mark attempt as executed
      retryAttempt.executedAt = new Date();
      await this.updateRetryAttempt(retryAttempt);

      // Update job status back to pending to trigger reprocessing
      await prisma.processingJob.update({
        where: { id: retryAttempt.jobId },
        data: {
          status: JobStatus.PENDING,
          errorMessage: null
        }
      });

      // The job will be picked up by the queue processor and executed again
      logger.info(`Job ${retryAttempt.jobId} reset to pending for retry execution`);

    } catch (error) {
      logger.error(`Failed to execute retry ${retryAttempt.id}:`, error);
      retryAttempt.successful = false;
      await this.updateRetryAttempt(retryAttempt);
    }
  }

  private async markJobAsFailed(jobId: string, errorId?: string): Promise<void> {
    try {
      const userMessage = errorId ?
        this.errorHandlingService.getUserMessage(errorId) :
        'Job failed after maximum retry attempts';

      await prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          errorMessage: userMessage
        }
      });

      // Update project status
      const job = await prisma.processingJob.findUnique({
        where: { id: jobId },
        select: { projectId: true }
      });

      if (job) {
        await prisma.project.update({
          where: { id: job.projectId },
          data: { status: 'FAILED' as any }
        });
      }

      logger.info(`Job ${jobId} marked as failed`);
    } catch (error) {
      logger.error(`Failed to mark job ${jobId} as failed:`, error);
    }
  }

  private async getRetryAttempts(jobId: string): Promise<RetryAttempt[]> {
    // In a real implementation, this would query a database
    // For now, return from memory
    return Array.from(this.retryQueue.values())
      .filter(attempt => attempt.jobId === jobId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  private async persistRetryAttempt(retryAttempt: RetryAttempt): Promise<void> {
    // In a real implementation, this would persist to database
    // For now, we're keeping everything in memory
    logger.debug(`Persisted retry attempt ${retryAttempt.id}`);
  }

  private async updateRetryAttempt(retryAttempt: RetryAttempt): Promise<void> {
    // In a real implementation, this would update the database
    // For now, we just update the in-memory copy
    this.retryQueue.set(retryAttempt.id, retryAttempt);
    logger.debug(`Updated retry attempt ${retryAttempt.id}`);
  }

  private async cancelPendingRetries(jobId: string): Promise<void> {
    // In a real implementation, this would update database records
    logger.debug(`Cancelled pending retries for job ${jobId}`);
  }

  private async loadPendingRetries(): Promise<void> {
    // In a real implementation, this would load pending retries from database
    // and reschedule them
    logger.info('Loaded pending retries from database');
  }

  private generateRetryId(): string {
    return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up old retry records
   */
  async cleanupOldRetries(olderThanDays: number = 7): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      for (const [id, retry] of this.retryQueue) {
        if (retry.scheduledAt < cutoffDate && retry.executedAt) {
          this.retryQueue.delete(id);
        }
      }

      logger.info(`Cleaned up retry records older than ${olderThanDays} days`);
    } catch (error) {
      logger.error('Failed to cleanup old retries:', error);
    }
  }

  /**
   * Mark a retry as successful (called when job completes successfully)
   */
  async markRetrySuccessful(jobId: string): Promise<void> {
    try {
      for (const retry of this.retryQueue.values()) {
        if (retry.jobId === jobId && retry.executedAt && !retry.successful) {
          retry.successful = true;
          await this.updateRetryAttempt(retry);
          logger.info(`Marked retry for job ${jobId} as successful`);
          break;
        }
      }
    } catch (error) {
      logger.error(`Failed to mark retry successful for job ${jobId}:`, error);
    }
  }
}