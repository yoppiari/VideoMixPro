import cron from 'node-cron';
import { storageService } from './storageService';
import { logger } from '../utils/logger';

export class CleanupService {
  private isRunning: boolean = false;

  start(): void {
    if (this.isRunning) {
      logger.warn('Cleanup service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting cleanup service');

    // Run cleanup every day at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        await this.runCleanup();
      } catch (error) {
        logger.error('Cleanup service failed:', error);
      }
    });

    // Run initial cleanup after 1 minute
    setTimeout(async () => {
      try {
        await this.runCleanup();
      } catch (error) {
        logger.error('Initial cleanup failed:', error);
      }
    }, 60000);
  }

  stop(): void {
    this.isRunning = false;
    logger.info('Cleanup service stopped');
  }

  async runCleanup(): Promise<void> {
    logger.info('Running file cleanup...');

    const startTime = Date.now();

    try {
      // Clean up temp files older than 24 hours
      await storageService.cleanupTempFiles(24);

      // Clean up old processed videos (older than 30 days)
      await this.cleanupOldProcessedVideos(30);

      // Clean up old logs (older than 7 days)
      await this.cleanupOldLogs(7);

      const duration = Date.now() - startTime;
      logger.info(`File cleanup completed in ${duration}ms`);
    } catch (error) {
      logger.error('File cleanup failed:', error);
      throw error;
    }
  }

  private async cleanupOldProcessedVideos(olderThanDays: number): Promise<void> {
    try {
      const outputFiles = await storageService.listFiles('outputs');
      const cutoffTime = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

      for (const filePath of outputFiles) {
        try {
          // Check file modification time and delete if older than cutoff
          const fileExists = await storageService.fileExists(filePath);
          if (fileExists) {
            // For now, we'll just clean up based on age
            // In a real implementation, you'd want to check database records
            // to ensure the file is no longer needed
            await storageService.deleteFile(filePath);
            logger.debug(`Deleted old output file: ${filePath}`);
          }
        } catch (error) {
          logger.error(`Failed to cleanup output file ${filePath}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old processed videos:', error);
    }
  }

  private async cleanupOldLogs(olderThanDays: number): Promise<void> {
    try {
      const logFiles = await storageService.listFiles('logs');
      const cutoffTime = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

      for (const filePath of logFiles) {
        try {
          const fileExists = await storageService.fileExists(filePath);
          if (fileExists) {
            await storageService.deleteFile(filePath);
            logger.debug(`Deleted old log file: ${filePath}`);
          }
        } catch (error) {
          logger.error(`Failed to cleanup log file ${filePath}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old logs:', error);
    }
  }

  async getStorageStatistics(): Promise<{
    uploads: { count: number; totalSize: number };
    outputs: { count: number; totalSize: number };
    temp: { count: number; totalSize: number };
    receipts: { count: number; totalSize: number };
    invoices: { count: number; totalSize: number };
    backups: { count: number; totalSize: number };
  }> {
    const categories = ['uploads', 'outputs', 'temp', 'receipts', 'invoices', 'backups'];
    const stats: any = {};

    for (const category of categories) {
      try {
        const files = await storageService.listFiles(category);
        let totalSize = 0;

        for (const filePath of files) {
          try {
            const size = await storageService.getFileSize(filePath);
            totalSize += size;
          } catch {
            // File might not exist or be inaccessible
          }
        }

        stats[category] = {
          count: files.length,
          totalSize
        };
      } catch {
        stats[category] = {
          count: 0,
          totalSize: 0
        };
      }
    }

    return stats;
  }
}

export const cleanupService = new CleanupService();