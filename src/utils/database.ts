import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment configuration
dotenv.config();

class DatabaseAdapter {
  private client: PrismaClient | null = null;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  async connect(): Promise<PrismaClient> {
    if (this.client) {
      return this.client;
    }

    try {
      // Detect database type from DATABASE_URL or DATABASE_PROVIDER
      const dbUrl = process.env.DATABASE_URL || '';
      const dbProvider = process.env.DATABASE_PROVIDER || '';
      
      let dbType = 'Unknown';
      let isPostgreSQL = false;
      
      if (dbUrl.startsWith('file:') || dbProvider === 'sqlite') {
        dbType = 'SQLite';
        isPostgreSQL = false;
      } else if (dbUrl.startsWith('postgres') || dbProvider === 'postgresql') {
        dbType = 'PostgreSQL';
        isPostgreSQL = true;
      }
      
      console.log(`🔧 Connecting to ${dbType} database (${process.env.NODE_ENV || 'development'})...`);

      // Create Prisma client with appropriate logging
      this.client = new PrismaClient({
        log: process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error', 'warn']
      });

      // Connect to database
      await this.client.$connect();

      // Success message based on actual database type
      if (isPostgreSQL) {
        console.log('✅ PostgreSQL database connected successfully');
      } else {
        console.log('✅ SQLite database connected successfully');
      }

      return this.client;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
      this.client = null;
      console.log('Database disconnected');
    }
  }

  getClient(): PrismaClient {
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

// Initialize Prisma client
let prismaClient: PrismaClient | null = null;

// Export Prisma client for backward compatibility
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    if (!prismaClient) {
      prismaClient = new PrismaClient({
        log: process.env.NODE_ENV === 'development'
          ? ['error', 'warn']
          : ['error']
      });
    }
    return prismaClient[prop as keyof PrismaClient];
  }
});

// Export types for use in application
export type { User, Project, VideoFile, ProcessingJob } from '@prisma/client';

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