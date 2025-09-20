import { Request, Response } from 'express';
import { prisma } from '@/utils/database';
import Redis from 'ioredis';
import { storageService } from './storageService';
import { logger } from '../utils/logger';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    storage: ServiceHealth;
    ffmpeg: ServiceHealth;
  };
  metrics: {
    memory: {
      used: number;
      free: number;
      total: number;
      percentage: number;
    };
    cpu: {
      percentage: number;
    };
    storage: {
      uploads: { count: number; totalSize: number };
      outputs: { count: number; totalSize: number };
      temp: { count: number; totalSize: number };
    };
  };
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  lastChecked: string;
}

export class HealthService {
  private prisma = prisma;
  private redis: Redis | null;

  constructor() {
    // Only initialize Redis if not using in-memory queue
    if (process.env.USE_IN_MEMORY_QUEUE !== 'true') {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      });
    } else {
      this.redis = null;
    }
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();
    const version = process.env.npm_package_version || '1.0.0';

    const [
      databaseHealth,
      redisHealth,
      storageHealth,
      ffmpegHealth,
      memoryMetrics,
      storageMetrics
    ] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
      this.checkFFmpeg(),
      this.getMemoryMetrics(),
      this.getStorageMetrics()
    ]);

    const services = {
      database: this.getResult(databaseHealth),
      redis: this.getResult(redisHealth),
      storage: this.getResult(storageHealth),
      ffmpeg: this.getResult(ffmpegHealth)
    };

    const metrics = {
      memory: this.getResult(memoryMetrics) || {
        used: 0,
        free: 0,
        total: 0,
        percentage: 0
      },
      cpu: {
        percentage: process.cpuUsage().user / 1000000 // Convert microseconds to percentage approximation
      },
      storage: this.getResult(storageMetrics) || {
        uploads: { count: 0, totalSize: 0 },
        outputs: { count: 0, totalSize: 0 },
        temp: { count: 0, totalSize: 0 }
      }
    };

    // Determine overall status
    const serviceStatuses = Object.values(services).map(s => s.status);
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (serviceStatuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (serviceStatuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp,
      uptime,
      version,
      services,
      metrics
    };
  }

  private getResult<T>(settledResult: PromiseSettledResult<T>): T {
    return settledResult.status === 'fulfilled' ? settledResult.value : ({} as T);
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();
    const lastChecked = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - start;

      return {
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime,
        lastChecked
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked
      };
    }
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const start = Date.now();
    const lastChecked = new Date().toISOString();

    // If using in-memory queue, Redis is not needed
    if (!this.redis) {
      return {
        status: 'healthy',
        responseTime: 0,
        lastChecked,
        error: 'Using in-memory queue (development mode)'
      };
    }

    try {
      await this.redis.ping();
      const responseTime = Date.now() - start;

      return {
        status: responseTime < 500 ? 'healthy' : 'degraded',
        responseTime,
        lastChecked
      };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked
      };
    }
  }

  private async checkStorage(): Promise<ServiceHealth> {
    const start = Date.now();
    const lastChecked = new Date().toISOString();

    try {
      // Test storage by checking if we can list files in uploads directory
      await storageService.listFiles('uploads');
      const responseTime = Date.now() - start;

      return {
        status: responseTime < 2000 ? 'healthy' : 'degraded',
        responseTime,
        lastChecked
      };
    } catch (error) {
      logger.error('Storage health check failed:', error);
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked
      };
    }
  }

  private async checkFFmpeg(): Promise<ServiceHealth> {
    const start = Date.now();
    const lastChecked = new Date().toISOString();

    try {
      const { execSync } = require('child_process');
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

      // Run ffmpeg -version to check if it's available
      execSync(`${ffmpegPath} -version`, { timeout: 5000 });
      const responseTime = Date.now() - start;

      return {
        status: responseTime < 3000 ? 'healthy' : 'degraded',
        responseTime,
        lastChecked
      };
    } catch (error) {
      logger.error('FFmpeg health check failed:', error);
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : 'FFmpeg not available',
        lastChecked
      };
    }
  }

  private async getMemoryMetrics() {
    const used = process.memoryUsage();
    const total = used.heapTotal;
    const free = total - used.heapUsed;
    const percentage = (used.heapUsed / total) * 100;

    return {
      used: used.heapUsed,
      free,
      total,
      percentage: Math.round(percentage * 100) / 100
    };
  }

  private async getStorageMetrics() {
    try {
      const stats = await storageService.getStorageStatistics();
      return {
        uploads: stats.uploads,
        outputs: stats.outputs,
        temp: stats.temp
      };
    } catch (error) {
      logger.error('Failed to get storage metrics:', error);
      return {
        uploads: { count: 0, totalSize: 0 },
        outputs: { count: 0, totalSize: 0 },
        temp: { count: 0, totalSize: 0 }
      };
    }
  }

  async handleHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.getHealthStatus();

      // Set appropriate HTTP status code
      let statusCode = 200;
      if (health.status === 'degraded') {
        statusCode = 200; // Still operational but with issues
      } else if (health.status === 'unhealthy') {
        statusCode = 503; // Service unavailable
      }

      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed'
      });
    }
  }

  async handleReadinessCheck(req: Request, res: Response): Promise<void> {
    try {
      // Readiness check - are we ready to serve traffic?
      const dbCheck = await this.checkDatabase();
      const redisCheck = await this.checkRedis();

      // Only fail if database is unhealthy, or if Redis is required and unhealthy
      const isReady = dbCheck.status !== 'unhealthy' &&
                      (!this.redis || redisCheck.status !== 'unhealthy');

      if (!isReady) {
        res.status(503).json({
          ready: false,
          timestamp: new Date().toISOString(),
          services: {
            database: dbCheck,
            redis: redisCheck
          }
        });
        return;
      }

      res.status(200).json({
        ready: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Readiness check failed:', error);
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Readiness check failed'
      });
    }
  }

  async handleLivenessCheck(req: Request, res: Response): Promise<void> {
    // Liveness check - is the application alive?
    res.status(200).json({
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  }

  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
    if (this.redis) {
      await this.redis.disconnect();
    }
  }
}

export const healthService = new HealthService();