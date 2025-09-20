import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';
import { storageService } from './storageService';
import { logger } from '../utils/logger';

export interface BackupConfig {
  database: {
    enabled: boolean;
    schedule: string; // cron expression
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
  private config: BackupConfig;
  private isRunning: boolean = false;
  private scheduledJobs: cron.ScheduledTask[] = [];

  constructor() {
    this.config = {
      database: {
        enabled: process.env.BACKUP_DATABASE_ENABLED === 'true',
        schedule: process.env.BACKUP_DATABASE_SCHEDULE || '0 2 * * *', // Daily at 2 AM
        retentionDays: parseInt(process.env.BACKUP_DATABASE_RETENTION_DAYS || '30')
      },
      files: {
        enabled: process.env.BACKUP_FILES_ENABLED === 'true',
        schedule: process.env.BACKUP_FILES_SCHEDULE || '0 3 * * 0', // Weekly on Sunday at 3 AM
        retentionDays: parseInt(process.env.BACKUP_FILES_RETENTION_DAYS || '90'),
        categories: ['uploads', 'outputs', 'receipts', 'invoices']
      },
      storage: {
        local: true,
        s3: process.env.AWS_S3_BUCKET ? true : false
      }
    };
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('Backup service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting backup service');

    // Schedule database backups
    if (this.config.database.enabled) {
      const dbJob = cron.schedule(this.config.database.schedule, async () => {
        try {
          await this.createDatabaseBackup();
        } catch (error) {
          logger.error('Scheduled database backup failed:', error);
        }
      }, { scheduled: false });

      dbJob.start();
      this.scheduledJobs.push(dbJob);
      logger.info(`Database backup scheduled: ${this.config.database.schedule}`);
    }

    // Schedule file backups
    if (this.config.files.enabled) {
      const filesJob = cron.schedule(this.config.files.schedule, async () => {
        try {
          await this.createFilesBackup();
        } catch (error) {
          logger.error('Scheduled files backup failed:', error);
        }
      }, { scheduled: false });

      filesJob.start();
      this.scheduledJobs.push(filesJob);
      logger.info(`Files backup scheduled: ${this.config.files.schedule}`);
    }

    // Schedule cleanup job
    const cleanupJob = cron.schedule('0 4 * * *', async () => {
      try {
        await this.cleanupOldBackups();
      } catch (error) {
        logger.error('Backup cleanup failed:', error);
      }
    }, { scheduled: false });

    cleanupJob.start();
    this.scheduledJobs.push(cleanupJob);
  }

  stop(): void {
    this.isRunning = false;
    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs = [];
    logger.info('Backup service stopped');
  }

  async createDatabaseBackup(): Promise<BackupMetadata> {
    const timestamp = new Date();
    const backupId = `db_${timestamp.toISOString().replace(/[:.]/g, '-')}`;
    const fileName = `${backupId}.sql`;
    const localPath = path.join(process.cwd(), 'backups', fileName);

    logger.info('Starting database backup...');

    try {
      // Ensure backup directory exists
      await fs.mkdir(path.dirname(localPath), { recursive: true });

      // Create database dump
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      // Extract connection details from DATABASE_URL
      const url = new URL(databaseUrl);
      const host = url.hostname;
      const port = url.port || '5432';
      const database = url.pathname.slice(1);
      const username = url.username;
      const password = url.password;

      // Set PGPASSWORD environment variable for pg_dump
      const env = { ...process.env, PGPASSWORD: password };

      // Create the backup using pg_dump
      const dumpCommand = `pg_dump -h ${host} -p ${port} -U ${username} -d ${database} -f "${localPath}"`;

      execSync(dumpCommand, {
        env,
        stdio: 'pipe',
        timeout: 300000 // 5 minutes timeout
      });

      // Get file size
      const stats = await fs.stat(localPath);
      const size = stats.size;

      // Store backup metadata
      const metadata: BackupMetadata = {
        id: backupId,
        type: 'database',
        timestamp,
        size,
        status: 'success',
        path: `backups/${fileName}`
      };

      // Upload to S3 if configured
      if (this.config.storage.s3) {
        await this.uploadToS3(localPath, `backups/${fileName}`);
      }

      logger.info(`Database backup completed: ${fileName} (${this.formatBytes(size)})`);
      return metadata;

    } catch (error) {
      logger.error('Database backup failed:', error);

      const metadata: BackupMetadata = {
        id: backupId,
        type: 'database',
        timestamp,
        size: 0,
        status: 'failed',
        path: `backups/${fileName}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      return metadata;
    }
  }

  async createFilesBackup(): Promise<BackupMetadata> {
    const timestamp = new Date();
    const backupId = `files_${timestamp.toISOString().replace(/[:.]/g, '-')}`;
    const fileName = `${backupId}.tar.gz`;
    const localPath = path.join(process.cwd(), 'backups', fileName);

    logger.info('Starting files backup...');

    try {
      // Ensure backup directory exists
      await fs.mkdir(path.dirname(localPath), { recursive: true });

      // Create tar archive of specified categories
      const categoriesToBackup = this.config.files.categories.join(' ');
      const tarCommand = `tar -czf "${localPath}" ${categoriesToBackup}`;

      execSync(tarCommand, {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 1800000 // 30 minutes timeout
      });

      // Get file size
      const stats = await fs.stat(localPath);
      const size = stats.size;

      // Store backup metadata
      const metadata: BackupMetadata = {
        id: backupId,
        type: 'files',
        timestamp,
        size,
        status: 'success',
        path: `backups/${fileName}`
      };

      // Upload to S3 if configured
      if (this.config.storage.s3) {
        await this.uploadToS3(localPath, `backups/${fileName}`);
      }

      logger.info(`Files backup completed: ${fileName} (${this.formatBytes(size)})`);
      return metadata;

    } catch (error) {
      logger.error('Files backup failed:', error);

      const metadata: BackupMetadata = {
        id: backupId,
        type: 'files',
        timestamp,
        size: 0,
        status: 'failed',
        path: `backups/${fileName}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      return metadata;
    }
  }

  private async uploadToS3(localPath: string, s3Key: string): Promise<void> {
    try {
      const fileBuffer = await fs.readFile(localPath);
      await storageService.storeFile(
        fileBuffer,
        path.basename(s3Key),
        'application/octet-stream',
        'backups'
      );
      logger.info(`Backup uploaded to S3: ${s3Key}`);
    } catch (error) {
      logger.error('Failed to upload backup to S3:', error);
      throw error;
    }
  }

  async cleanupOldBackups(): Promise<void> {
    logger.info('Starting backup cleanup...');

    try {
      const backupFiles = await storageService.listFiles('backups');
      const now = new Date();

      for (const filePath of backupFiles) {
        try {
          const fileName = path.basename(filePath);

          // Extract backup type and timestamp from filename
          let retentionDays: number;
          if (fileName.startsWith('db_')) {
            retentionDays = this.config.database.retentionDays;
          } else if (fileName.startsWith('files_')) {
            retentionDays = this.config.files.retentionDays;
          } else {
            continue; // Skip unknown file types
          }

          // Extract timestamp from filename
          const timestampMatch = fileName.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
          if (!timestampMatch) {
            continue;
          }

          const fileTimestamp = new Date(timestampMatch[1].replace(/-/g, ':'));
          const ageInDays = (now.getTime() - fileTimestamp.getTime()) / (1000 * 60 * 60 * 24);

          if (ageInDays > retentionDays) {
            await storageService.deleteFile(filePath);
            logger.info(`Deleted old backup: ${fileName} (${Math.round(ageInDays)} days old)`);
          }

        } catch (error) {
          logger.error(`Failed to process backup file ${filePath}:`, error);
        }
      }

      logger.info('Backup cleanup completed');

    } catch (error) {
      logger.error('Backup cleanup failed:', error);
      throw error;
    }
  }

  async getBackupList(): Promise<BackupMetadata[]> {
    try {
      const backupFiles = await storageService.listFiles('backups');
      const backups: BackupMetadata[] = [];

      for (const filePath of backupFiles) {
        try {
          const fileName = path.basename(filePath);

          // Extract backup type and timestamp from filename
          let type: 'database' | 'files';
          if (fileName.startsWith('db_')) {
            type = 'database';
          } else if (fileName.startsWith('files_')) {
            type = 'files';
          } else {
            continue;
          }

          // Extract timestamp from filename
          const timestampMatch = fileName.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
          if (!timestampMatch) {
            continue;
          }

          const timestamp = new Date(timestampMatch[1].replace(/-/g, ':'));
          const size = await storageService.getFileSize(filePath);

          backups.push({
            id: fileName.replace(/\.(sql|tar\.gz)$/, ''),
            type,
            timestamp,
            size,
            status: 'success',
            path: filePath
          });

        } catch (error) {
          logger.error(`Failed to get metadata for backup ${filePath}:`, error);
        }
      }

      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    } catch (error) {
      logger.error('Failed to get backup list:', error);
      return [];
    }
  }

  async restoreDatabase(backupId: string): Promise<void> {
    logger.info(`Starting database restore from backup: ${backupId}`);

    try {
      const backupPath = `backups/${backupId}.sql`;
      const fileExists = await storageService.fileExists(backupPath);

      if (!fileExists) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Download backup file if needed
      const localPath = path.join(process.cwd(), 'temp', `${backupId}.sql`);
      await fs.mkdir(path.dirname(localPath), { recursive: true });

      const backupData = await storageService.getFile(backupPath);
      await fs.writeFile(localPath, backupData);

      // Restore database
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      const url = new URL(databaseUrl);
      const host = url.hostname;
      const port = url.port || '5432';
      const database = url.pathname.slice(1);
      const username = url.username;
      const password = url.password;

      const env = { ...process.env, PGPASSWORD: password };
      const restoreCommand = `psql -h ${host} -p ${port} -U ${username} -d ${database} -f "${localPath}"`;

      execSync(restoreCommand, {
        env,
        stdio: 'pipe',
        timeout: 600000 // 10 minutes timeout
      });

      // Clean up temp file
      await fs.unlink(localPath);

      logger.info(`Database restore completed from backup: ${backupId}`);

    } catch (error) {
      logger.error('Database restore failed:', error);
      throw error;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const backupService = new BackupService();