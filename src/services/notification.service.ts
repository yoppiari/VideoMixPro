import { EventEmitter } from 'events';
import { database } from '@/utils/database';
import logger from '@/utils/logger';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  isRead: boolean;
  priority: NotificationPriority;
  category: NotificationCategory;
  expiresAt?: Date;
  createdAt: Date;
  readAt?: Date;
}

export type NotificationType =
  | 'PAYMENT_CREATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'CREDITS_ADDED'
  | 'CREDITS_LOW'
  | 'PROJECT_COMPLETED'
  | 'PROJECT_FAILED'
  | 'SYSTEM_MAINTENANCE'
  | 'WELCOME'
  | 'FEATURE_ANNOUNCEMENT'
  | 'SECURITY_ALERT';

export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type NotificationCategory = 'PAYMENT' | 'PROJECT' | 'SYSTEM' | 'MARKETING' | 'SECURITY';

export interface NotificationTemplate {
  type: NotificationType;
  category: NotificationCategory;
  defaultPriority: NotificationPriority;
  titleTemplate: string;
  messageTemplate: string;
  expiryHours?: number;
  isRealTime: boolean;
}

class NotificationService extends EventEmitter {
  private templates: Map<NotificationType, NotificationTemplate> = new Map();
  private userConnections: Map<string, Set<any>> = new Map(); // WebSocket connections

  constructor() {
    super();
    this.initializeTemplates();
  }

  /**
   * Initialize notification templates
   */
  private initializeTemplates(): void {
    const templates: NotificationTemplate[] = [
      {
        type: 'PAYMENT_CREATED',
        category: 'PAYMENT',
        defaultPriority: 'MEDIUM',
        titleTemplate: 'Payment Created',
        messageTemplate: 'Your payment {{receiptNumber}} for {{amount}} has been created and is pending confirmation.',
        expiryHours: 72,
        isRealTime: true,
      },
      {
        type: 'PAYMENT_CONFIRMED',
        category: 'PAYMENT',
        defaultPriority: 'HIGH',
        titleTemplate: 'Payment Confirmed!',
        messageTemplate: 'Your payment {{receiptNumber}} has been confirmed. {{credits}} credits have been added to your account.',
        expiryHours: 168, // 7 days
        isRealTime: true,
      },
      {
        type: 'PAYMENT_FAILED',
        category: 'PAYMENT',
        defaultPriority: 'HIGH',
        titleTemplate: 'Payment Issue',
        messageTemplate: 'There was an issue with your payment {{receiptNumber}}. Please check your payment details or contact support.',
        expiryHours: 168, // 7 days
        isRealTime: true,
      },
      {
        type: 'CREDITS_ADDED',
        category: 'PAYMENT',
        defaultPriority: 'MEDIUM',
        titleTemplate: 'Credits Added',
        messageTemplate: '{{credits}} credits have been added to your account. Your new balance is {{totalCredits}} credits.',
        expiryHours: 48,
        isRealTime: true,
      },
      {
        type: 'CREDITS_LOW',
        category: 'PAYMENT',
        defaultPriority: 'MEDIUM',
        titleTemplate: 'Credits Running Low',
        messageTemplate: 'You have {{credits}} credits remaining. Consider purchasing more credits to continue using VideoMixPro.',
        expiryHours: 168, // 7 days
        isRealTime: true,
      },
      {
        type: 'PROJECT_COMPLETED',
        category: 'PROJECT',
        defaultPriority: 'MEDIUM',
        titleTemplate: 'Project Completed',
        messageTemplate: 'Your project "{{projectName}}" has been completed successfully. {{videoCount}} videos have been processed.',
        expiryHours: 72,
        isRealTime: true,
      },
      {
        type: 'PROJECT_FAILED',
        category: 'PROJECT',
        defaultPriority: 'HIGH',
        titleTemplate: 'Project Failed',
        messageTemplate: 'Your project "{{projectName}}" encountered an error during processing. Please try again or contact support.',
        expiryHours: 168, // 7 days
        isRealTime: true,
      },
      {
        type: 'SYSTEM_MAINTENANCE',
        category: 'SYSTEM',
        defaultPriority: 'MEDIUM',
        titleTemplate: 'Scheduled Maintenance',
        messageTemplate: 'VideoMixPro will undergo maintenance on {{maintenanceDate}}. The platform will be unavailable for approximately {{duration}}.',
        expiryHours: 48,
        isRealTime: false,
      },
      {
        type: 'WELCOME',
        category: 'MARKETING',
        defaultPriority: 'LOW',
        titleTemplate: 'Welcome to VideoMixPro!',
        messageTemplate: 'Welcome {{firstName}}! You have {{credits}} credits to start creating amazing video content. Check out our tutorials to get started.',
        expiryHours: 168, // 7 days
        isRealTime: false,
      },
      {
        type: 'FEATURE_ANNOUNCEMENT',
        category: 'MARKETING',
        defaultPriority: 'LOW',
        titleTemplate: 'New Feature Available',
        messageTemplate: 'We have added a new feature: {{featureName}}. {{featureDescription}}',
        expiryHours: 336, // 14 days
        isRealTime: false,
      },
      {
        type: 'SECURITY_ALERT',
        category: 'SECURITY',
        defaultPriority: 'URGENT',
        titleTemplate: 'Security Alert',
        messageTemplate: 'We detected a {{alertType}} on your account. If this was not you, please secure your account immediately.',
        expiryHours: 72,
        isRealTime: true,
      },
    ];

    templates.forEach(template => {
      this.templates.set(template.type, template);
    });

    logger.info('Notification templates initialized');
  }

  /**
   * Create a new notification
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    data: Record<string, any> = {},
    options: {
      priority?: NotificationPriority;
      expiresAt?: Date;
      customTitle?: string;
      customMessage?: string;
    } = {}
  ): Promise<Notification> {
    try {
      const template = this.templates.get(type);
      if (!template) {
        throw new Error(`Unknown notification type: ${type}`);
      }

      const title = options.customTitle || this.renderTemplate(template.titleTemplate, data);
      const message = options.customMessage || this.renderTemplate(template.messageTemplate, data);

      const expiresAt = options.expiresAt ||
        (template.expiryHours ? new Date(Date.now() + template.expiryHours * 60 * 60 * 1000) : undefined);

      const prisma = database.getPrisma();
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data: JSON.stringify(data),
          isRead: false,
          priority: options.priority || template.defaultPriority,
          category: template.category,
          expiresAt,
        },
      });

      const notificationWithParsedData: Notification = {
        ...notification,
        data: JSON.parse(notification.data || '{}'),
      };

      // Emit real-time notification if enabled
      if (template.isRealTime) {
        await this.emitRealTimeNotification(userId, notificationWithParsedData);
      }

      // Emit event for other services
      this.emit('notification:created', {
        userId,
        notification: notificationWithParsedData,
        type,
      });

      logger.info(`Notification created for user ${userId}: ${type}`);
      return notificationWithParsedData;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      category?: NotificationCategory;
      isRead?: boolean;
      priority?: NotificationPriority;
    } = {}
  ): Promise<{
    notifications: Notification[];
    totalCount: number;
    unreadCount: number;
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const offset = (page - 1) * limit;

      const whereClause: any = {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      };

      if (options.category) whereClause.category = options.category;
      if (options.isRead !== undefined) whereClause.isRead = options.isRead;
      if (options.priority) whereClause.priority = options.priority;

      const prisma = database.getPrisma();
      const [notifications, totalCount, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where: whereClause,
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
          skip: offset,
          take: limit,
        }),
        prisma.notification.count({ where: whereClause }),
        prisma.notification.count({
          where: {
            userId,
            isRead: false,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        }),
      ]);

      const notificationsWithParsedData: Notification[] = notifications.map(notification => ({
        ...notification,
        data: JSON.parse(notification.data || '{}'),
      }));

      return {
        notifications: notificationsWithParsedData,
        totalCount,
        unreadCount,
      };
    } catch (error) {
      logger.error('Failed to get user notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const prisma = database.getPrisma();
      const result = await prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      if (result.count > 0) {
        this.emit('notification:read', { notificationId, userId });
        logger.info(`Notification ${notificationId} marked as read for user ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const prisma = database.getPrisma();
      const result = await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      this.emit('notification:all_read', { userId, count: result.count });
      logger.info(`Marked ${result.count} notifications as read for user ${userId}`);
      return result.count;
    } catch (error) {
      logger.error('Failed to mark all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      const prisma = database.getPrisma();
      const result = await prisma.notification.deleteMany({
        where: {
          id: notificationId,
          userId,
        },
      });

      if (result.count > 0) {
        this.emit('notification:deleted', { notificationId, userId });
        logger.info(`Notification ${notificationId} deleted for user ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to delete notification:', error);
      throw error;
    }
  }

  /**
   * Clean expired notifications
   */
  async cleanExpiredNotifications(): Promise<number> {
    try {
      const prisma = database.getPrisma();
      const result = await prisma.notification.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      logger.info(`Cleaned ${result.count} expired notifications`);
      return result.count;
    } catch (error) {
      logger.error('Failed to clean expired notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId?: string): Promise<{
    total: number;
    unread: number;
    byCategory: Record<NotificationCategory, number>;
    byPriority: Record<NotificationPriority, number>;
    recentCount: number;
  }> {
    try {
      const prisma = database.getPrisma();
      const whereClause = userId ? { userId } : {};

      const [total, unread, categoryStats, priorityStats, recentCount] = await Promise.all([
        prisma.notification.count({ where: whereClause }),
        prisma.notification.count({ where: { ...whereClause, isRead: false } }),
        prisma.notification.groupBy({
          by: ['category'],
          where: whereClause,
          _count: true,
        }),
        prisma.notification.groupBy({
          by: ['priority'],
          where: whereClause,
          _count: true,
        }),
        prisma.notification.count({
          where: {
            ...whereClause,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        }),
      ]);

      const byCategory = categoryStats.reduce((acc, stat) => {
        acc[stat.category as NotificationCategory] = stat._count;
        return acc;
      }, {} as Record<NotificationCategory, number>);

      const byPriority = priorityStats.reduce((acc, stat) => {
        acc[stat.priority as NotificationPriority] = stat._count;
        return acc;
      }, {} as Record<NotificationPriority, number>);

      return {
        total,
        unread,
        byCategory,
        byPriority,
        recentCount,
      };
    } catch (error) {
      logger.error('Failed to get notification stats:', error);
      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(
    userIds: string[],
    type: NotificationType,
    data: Record<string, any> = {},
    options: {
      priority?: NotificationPriority;
      expiresAt?: Date;
      batchSize?: number;
    } = {}
  ): Promise<number> {
    const batchSize = options.batchSize || 100;
    let successCount = 0;

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const promises = batch.map(userId =>
        this.createNotification(userId, type, data, options)
          .then(() => successCount++)
          .catch(error => logger.error(`Failed to create notification for user ${userId}:`, error))
      );

      await Promise.allSettled(promises);
    }

    logger.info(`Created ${successCount} bulk notifications of type ${type}`);
    return successCount;
  }

  /**
   * Register WebSocket connection for real-time notifications
   */
  registerConnection(userId: string, connection: any): void {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connection);

    connection.on('close', () => {
      this.unregisterConnection(userId, connection);
    });

    logger.info(`WebSocket connection registered for user ${userId}`);
  }

  /**
   * Unregister WebSocket connection
   */
  unregisterConnection(userId: string, connection: any): void {
    const connections = this.userConnections.get(userId);
    if (connections) {
      connections.delete(connection);
      if (connections.size === 0) {
        this.userConnections.delete(userId);
      }
    }
    logger.info(`WebSocket connection unregistered for user ${userId}`);
  }

  /**
   * Emit real-time notification to user
   */
  private async emitRealTimeNotification(userId: string, notification: Notification): Promise<void> {
    const connections = this.userConnections.get(userId);
    if (connections && connections.size > 0) {
      const message = JSON.stringify({
        type: 'notification',
        data: notification,
      });

      connections.forEach(connection => {
        try {
          if (connection.readyState === 1) { // WebSocket.OPEN
            connection.send(message);
          }
        } catch (error) {
          logger.error('Failed to send real-time notification:', error);
        }
      });

      logger.info(`Real-time notification sent to user ${userId}`);
    }
  }

  /**
   * Render template with data
   */
  private renderTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }
}

export const notificationService = new NotificationService();
export default notificationService;