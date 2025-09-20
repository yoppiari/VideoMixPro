import { PrismaClient } from '../../node_modules/.prisma/client-dev';
import dotenv from 'dotenv';
import path from 'path';

// Load environment-specific configuration
const envFile = process.env.NODE_ENV === 'development'
  ? '.env.development'
  : '.env';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Type definitions for unified Prisma client
type AnyPrismaClient = PrismaClient;

class DatabaseAdapter {
  private client: AnyPrismaClient | null = null;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  async connect(): Promise<AnyPrismaClient> {
    if (this.client) {
      return this.client;
    }

    try {
      if (this.isDevelopment) {
        console.log('🔧 Connecting to SQLite database (Development)...');

        // Use SQLite for development
        this.client = new PrismaClient({
          datasources: {
            db: {
              url: process.env.DATABASE_URL_DEV || 'file:./prisma/dev.db'
            }
          },
          log: ['error', 'warn']
        }) as any;
      } else {
        console.log('🚀 Connecting to PostgreSQL database (Production)...');

        // Use PostgreSQL for production
        this.client = new PrismaClient({
          datasources: {
            db: {
              url: process.env.DATABASE_URL
            }
          },
          log: ['error', 'warn']
        }) as any;
      }

      // Connect to database
      await (this.client as any).$connect();
      console.log('✅ Database connected successfully');

      return this.client as AnyPrismaClient;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await (this.client as any).$disconnect();
      this.client = null;
      console.log('Database disconnected');
    }
  }

  getClient(): AnyPrismaClient {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.client;
  }

  isDev(): boolean {
    return this.isDevelopment;
  }

  // Helper to handle JSON fields (SQLite stores as string, PostgreSQL as JSON)
  parseJson(data: any): any {
    if (this.isDevelopment && typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  // Helper to prepare JSON for storage
  stringifyJson(data: any): any {
    if (this.isDevelopment && typeof data === 'object') {
      return JSON.stringify(data);
    }
    return data;
  }
}

// Export singleton instance
export const database = new DatabaseAdapter();

// Export Prisma client for backward compatibility
export const prisma = new Proxy({} as any, {
  get(target, prop) {
    const client = database.getClient();
    return client[prop as keyof typeof client];
  }
});

// Export types for use in application
export type { User, Project, VideoFile, ProcessingJob } from '../../node_modules/.prisma/client-dev';

// Export enums as objects for SQLite compatibility
export const LicenseType = {
  FREE: 'FREE',
  PREMIUM: 'PREMIUM',
  ENTERPRISE: 'ENTERPRISE'
} as const;

export const ProjectStatus = {
  DRAFT: 'DRAFT',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
} as const;

export const JobStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
} as const;

export const TransactionType = {
  PURCHASE: 'PURCHASE',
  USAGE: 'USAGE',
  REFUND: 'REFUND'
} as const;