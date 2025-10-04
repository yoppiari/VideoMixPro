/*
 * TEMPORARILY DISABLED: Cleanup service
 * Reason: Logger import error
 * This service will be re-enabled after fixing import issues
 * Date disabled: 2025-10-04
 */

import logger from '../utils/logger'; // Fixed import

export class CleanupService {
  private isRunning: boolean = false;

  start(): void {
    logger.warn('Cleanup service is disabled');
  }

  stop(): void {
    logger.warn('Cleanup service is disabled');
  }

  async runCleanup(): Promise<void> {
    logger.warn('Cleanup service is disabled - runCleanup not available');
  }

  async getStorageStatistics(): Promise<{
    uploads: { count: number; totalSize: number };
    outputs: { count: number; totalSize: number };
    temp: { count: number; totalSize: number };
    receipts: { count: number; totalSize: number };
    invoices: { count: number; totalSize: number };
    backups: { count: number; totalSize: number };
  }> {
    return {
      uploads: { count: 0, totalSize: 0 },
      outputs: { count: 0, totalSize: 0 },
      temp: { count: 0, totalSize: 0 },
      receipts: { count: 0, totalSize: 0 },
      invoices: { count: 0, totalSize: 0 },
      backups: { count: 0, totalSize: 0 },
    };
  }
}

export const cleanupService = new CleanupService();
