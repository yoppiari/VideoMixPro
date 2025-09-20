import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import AWS from 'aws-sdk';

export interface StorageConfig {
  provider: 'local' | 's3';
  basePath?: string;
  s3Config?: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucket: string;
  };
}

export interface FileMetadata {
  originalName: string;
  fileName: string;
  path: string;
  size: number;
  mimeType: string;
  uploadedAt: Date;
}

export class StorageService {
  private config: StorageConfig;
  private s3?: AWS.S3;

  constructor(config: StorageConfig) {
    this.config = config;

    if (config.provider === 's3' && config.s3Config) {
      this.s3 = new AWS.S3({
        accessKeyId: config.s3Config.accessKeyId,
        secretAccessKey: config.s3Config.secretAccessKey,
        region: config.s3Config.region
      });
    }
  }

  async storeFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    category: 'uploads' | 'outputs' | 'receipts' | 'invoices' | 'backups' | 'temp'
  ): Promise<FileMetadata> {
    const fileName = `${uuidv4()}_${originalName}`;
    const filePath = path.join(category, fileName);

    if (this.config.provider === 'local') {
      return this.storeFileLocal(buffer, originalName, fileName, filePath, mimeType, category);
    } else if (this.config.provider === 's3') {
      return this.storeFileS3(buffer, originalName, fileName, filePath, mimeType);
    }

    throw new Error(`Unsupported storage provider: ${this.config.provider}`);
  }

  private async storeFileLocal(
    buffer: Buffer,
    originalName: string,
    fileName: string,
    filePath: string,
    mimeType: string,
    category: string
  ): Promise<FileMetadata> {
    const basePath = this.config.basePath || process.cwd();
    const categoryPath = path.join(basePath, category);
    const fullPath = path.join(basePath, filePath);

    // Ensure category directory exists
    await fs.mkdir(categoryPath, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, buffer);

    return {
      originalName,
      fileName,
      path: filePath,
      size: buffer.length,
      mimeType,
      uploadedAt: new Date()
    };
  }

  private async storeFileS3(
    buffer: Buffer,
    originalName: string,
    fileName: string,
    filePath: string,
    mimeType: string
  ): Promise<FileMetadata> {
    if (!this.s3 || !this.config.s3Config) {
      throw new Error('S3 not configured');
    }

    const uploadParams = {
      Bucket: this.config.s3Config.bucket,
      Key: filePath,
      Body: buffer,
      ContentType: mimeType,
      Metadata: {
        originalName: originalName
      }
    };

    await this.s3.upload(uploadParams).promise();

    return {
      originalName,
      fileName,
      path: filePath,
      size: buffer.length,
      mimeType,
      uploadedAt: new Date()
    };
  }

  async getFile(filePath: string): Promise<Buffer> {
    if (this.config.provider === 'local') {
      const basePath = this.config.basePath || process.cwd();
      const fullPath = path.join(basePath, filePath);
      return fs.readFile(fullPath);
    } else if (this.config.provider === 's3') {
      if (!this.s3 || !this.config.s3Config) {
        throw new Error('S3 not configured');
      }

      const downloadParams = {
        Bucket: this.config.s3Config.bucket,
        Key: filePath
      };

      const result = await this.s3.getObject(downloadParams).promise();
      return result.Body as Buffer;
    }

    throw new Error(`Unsupported storage provider: ${this.config.provider}`);
  }

  async deleteFile(filePath: string): Promise<void> {
    if (this.config.provider === 'local') {
      const basePath = this.config.basePath || process.cwd();
      const fullPath = path.join(basePath, filePath);

      try {
        await fs.unlink(fullPath);
      } catch (error) {
        // File might not exist, which is fine
        if ((error as any).code !== 'ENOENT') {
          throw error;
        }
      }
    } else if (this.config.provider === 's3') {
      if (!this.s3 || !this.config.s3Config) {
        throw new Error('S3 not configured');
      }

      const deleteParams = {
        Bucket: this.config.s3Config.bucket,
        Key: filePath
      };

      await this.s3.deleteObject(deleteParams).promise();
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      if (this.config.provider === 'local') {
        const basePath = this.config.basePath || process.cwd();
        const fullPath = path.join(basePath, filePath);
        await fs.access(fullPath);
        return true;
      } else if (this.config.provider === 's3') {
        if (!this.s3 || !this.config.s3Config) {
          throw new Error('S3 not configured');
        }

        const headParams = {
          Bucket: this.config.s3Config.bucket,
          Key: filePath
        };

        await this.s3.headObject(headParams).promise();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getFileSize(filePath: string): Promise<number> {
    if (this.config.provider === 'local') {
      const basePath = this.config.basePath || process.cwd();
      const fullPath = path.join(basePath, filePath);
      const stats = await fs.stat(fullPath);
      return stats.size;
    } else if (this.config.provider === 's3') {
      if (!this.s3 || !this.config.s3Config) {
        throw new Error('S3 not configured');
      }

      const headParams = {
        Bucket: this.config.s3Config.bucket,
        Key: filePath
      };

      const result = await this.s3.headObject(headParams).promise();
      return result.ContentLength || 0;
    }

    throw new Error(`Unsupported storage provider: ${this.config.provider}`);
  }

  async listFiles(category: string, prefix?: string): Promise<string[]> {
    const categoryPath = prefix ? path.join(category, prefix) : category;

    if (this.config.provider === 'local') {
      const basePath = this.config.basePath || process.cwd();
      const fullPath = path.join(basePath, categoryPath);

      try {
        const files = await fs.readdir(fullPath);
        return files.map(file => path.join(categoryPath, file));
      } catch {
        return [];
      }
    } else if (this.config.provider === 's3') {
      if (!this.s3 || !this.config.s3Config) {
        throw new Error('S3 not configured');
      }

      const listParams = {
        Bucket: this.config.s3Config.bucket,
        Prefix: categoryPath + '/'
      };

      const result = await this.s3.listObjectsV2(listParams).promise();
      return result.Contents?.map(obj => obj.Key || '') || [];
    }

    throw new Error(`Unsupported storage provider: ${this.config.provider}`);
  }

  async cleanupTempFiles(olderThanHours: number = 24): Promise<void> {
    const tempFiles = await this.listFiles('temp');
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    for (const filePath of tempFiles) {
      try {
        if (this.config.provider === 'local') {
          const basePath = this.config.basePath || process.cwd();
          const fullPath = path.join(basePath, filePath);
          const stats = await fs.stat(fullPath);

          if (stats.mtime < cutoffTime) {
            await this.deleteFile(filePath);
          }
        } else if (this.config.provider === 's3') {
          if (!this.s3 || !this.config.s3Config) {
            continue;
          }

          const headParams = {
            Bucket: this.config.s3Config.bucket,
            Key: filePath
          };

          const result = await this.s3.headObject(headParams).promise();

          if (result.LastModified && result.LastModified < cutoffTime) {
            await this.deleteFile(filePath);
          }
        }
      } catch (error) {
        console.error(`Failed to cleanup temp file ${filePath}:`, error);
      }
    }
  }
}

// Create storage service instance
const storageConfig: StorageConfig = {
  provider: process.env.STORAGE_PROVIDER === 's3' ? 's3' : 'local',
  basePath: process.cwd(),
  s3Config: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.AWS_S3_BUCKET!
  } : undefined
};

export const storageService = new StorageService(storageConfig);