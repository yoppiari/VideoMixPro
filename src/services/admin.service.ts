/*
 * TEMPORARILY DISABLED: Admin service
 * Reason: Payment and AdminLog models are not defined in schema.prisma
 * This service will be re-enabled when the missing models are added to the database schema
 * Missing models: Payment, AdminLog
 * Date disabled: 2025-10-04
 */

import { PrismaClient, User } from '@prisma/client';
import logger from '@/utils/logger';

export interface UserUpdateData {
  email?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  credits?: number;
  licenseType?: string;
  licenseExpiry?: Date;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalAdmins: number;
  totalPayments: number;
  totalRevenue: number;
  pendingPayments: number;
  recentUsers: number;
  recentPayments: number;
}

export interface SystemHealth {
  database: 'healthy' | 'warning' | 'error';
  emailService: 'healthy' | 'warning' | 'error';
  storage: 'healthy' | 'warning' | 'error';
  uptime: number;
  memoryUsage: number;
  diskUsage?: number;
}

export class AdminService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // All methods return errors or minimal stubs
  async getAdminStats(): Promise<AdminStats> {
    logger.error('AdminService.getAdminStats disabled - missing Payment model');
    throw new Error('Admin features temporarily unavailable');
  }

  async getSystemHealth(): Promise<SystemHealth> {
    logger.error('AdminService.getSystemHealth disabled');
    throw new Error('Admin features temporarily unavailable');
  }

  async getUsers(): Promise<any> {
    logger.error('AdminService.getUsers disabled - missing Payment model');
    throw new Error('Admin features temporarily unavailable');
  }

  async getUserDetails(): Promise<any> {
    logger.error('AdminService.getUserDetails disabled - missing Payment model');
    throw new Error('Admin features temporarily unavailable');
  }

  async updateUser(): Promise<any> {
    logger.error('AdminService.updateUser disabled - missing AdminLog model');
    throw new Error('Admin features temporarily unavailable');
  }

  async createAdminUser(): Promise<any> {
    logger.error('AdminService.createAdminUser disabled - missing AdminLog model');
    throw new Error('Admin features temporarily unavailable');
  }

  async getAdminLogs(): Promise<any> {
    logger.error('AdminService.getAdminLogs disabled - missing AdminLog model');
    throw new Error('Admin features temporarily unavailable');
  }

  async addCreditsToUser(): Promise<any> {
    logger.error('AdminService.addCreditsToUser disabled - missing AdminLog model');
    throw new Error('Admin features temporarily unavailable');
  }

  async getUserAnalytics(): Promise<any> {
    logger.error('AdminService.getUserAnalytics disabled - missing Payment model');
    throw new Error('Admin features temporarily unavailable');
  }

  async exportUsersData(): Promise<string> {
    logger.error('AdminService.exportUsersData disabled - missing Payment model');
    throw new Error('Admin features temporarily unavailable');
  }
}
