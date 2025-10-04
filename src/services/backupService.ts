/*
 * TEMPORARILY DISABLED: Backup service
 * Reason: Logger import error and cron type issues
 * This service will be re-enabled after fixing import issues
 * Date disabled: 2025-10-04
 */

import logger from '../utils/logger'; // Fixed import

export interface BackupConfig {
  database: {
    enabled: boolean;
    schedule: string;
    retentionDays: number;
  };
  files: {
    enabled: boolean;
    schedule: string;
    retentionDays: number;
    categories: string[];
  };
  storage: {
    local: boolean;
    s3: boolean;
  };
}

export interface BackupMetadata {
  id: string;
  type: 'database' | 'files';
  timestamp: Date;
  size: number;
  status: 'success' | 'failed';
  path: string;
  error?: string;
}

export class BackupService {
  constructor() {
    logger.info('BackupService initialized (disabled - needs fixing)');
  }

  start(): void {
    logger.warn('Backup service is disabled');
  }

  stop(): void {
    logger.warn('Backup service is disabled');
  }

  async createDatabaseBackup(): Promise<BackupMetadata> {
    logger.error('Backup service disabled - createDatabaseBackup not available');
    throw new Error('Backup service temporarily unavailable');
  }

  async createFilesBackup(): Promise<BackupMetadata> {
    logger.error('Backup service disabled - createFilesBackup not available');
    throw new Error('Backup service temporarily unavailable');
  }

  async cleanupOldBackups(): Promise<void> {
    logger.warn('Backup service disabled - cleanup not available');
  }

  async getBackupList(): Promise<BackupMetadata[]> {
    return [];
  }

  async restoreDatabase(): Promise<void> {
    logger.error('Backup service disabled - restore not available');
    throw new Error('Backup service temporarily unavailable');
  }
}

export const backupService = new BackupService();
