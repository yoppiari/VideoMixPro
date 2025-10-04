/*
 * TEMPORARILY DISABLED: Health service
 * Reason: Logger import error and Redis options incompatibility
 * This service will be re-enabled after fixing import issues
 * Date disabled: 2025-10-04
 */

import { Request, Response } from 'express';
import logger from '../utils/logger'; // Fixed import

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
  constructor() {
    logger.info('HealthService initialized (disabled - needs fixing)');
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();
    const version = process.env.npm_package_version || '1.0.0';
    const memUsage = process.memoryUsage();

    return {
      status: 'degraded',
      timestamp,
      uptime,
      version,
      services: {
        database: {
          status: 'healthy',
          lastChecked: timestamp,
        },
        redis: {
          status: 'degraded',
          lastChecked: timestamp,
          error: 'Health service disabled',
        },
        storage: {
          status: 'degraded',
          lastChecked: timestamp,
          error: 'Health service disabled',
        },
        ffmpeg: {
          status: 'degraded',
          lastChecked: timestamp,
          error: 'Health service disabled',
        },
      },
      metrics: {
        memory: {
          used: memUsage.heapUsed,
          free: memUsage.heapTotal - memUsage.heapUsed,
          total: memUsage.heapTotal,
          percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        },
        cpu: {
          percentage: 0,
        },
        storage: {
          uploads: { count: 0, totalSize: 0 },
          outputs: { count: 0, totalSize: 0 },
          temp: { count: 0, totalSize: 0 },
        },
      },
    };
  }

  async checkDatabase(): Promise<ServiceHealth> {
    return {
      status: 'degraded',
      lastChecked: new Date().toISOString(),
      error: 'Health service disabled',
    };
  }

  async checkRedis(): Promise<ServiceHealth> {
    return {
      status: 'degraded',
      lastChecked: new Date().toISOString(),
      error: 'Health service disabled',
    };
  }

  async checkStorage(): Promise<ServiceHealth> {
    return {
      status: 'degraded',
      lastChecked: new Date().toISOString(),
      error: 'Health service disabled',
    };
  }

  async checkFFmpeg(): Promise<ServiceHealth> {
    return {
      status: 'degraded',
      lastChecked: new Date().toISOString(),
      error: 'Health service disabled',
    };
  }
}

export const healthService = new HealthService();
