import { database } from '@/utils/database';
import logger from '@/utils/logger';

export interface EmailAnalytics {
  totalEmails: number;
  sentEmails: number;
  failedEmails: number;
  pendingEmails: number;
  successRate: number;
  failureRate: number;
  emailsByType: Record<string, number>;
  emailsByStatus: Record<string, number>;
  dailyStats: Array<{
    date: string;
    sent: number;
    failed: number;
    total: number;
  }>;
  topFailureReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  userEngagement: {
    uniqueRecipients: number;
    averageEmailsPerUser: number;
    mostActiveUsers: Array<{
      userId: string;
      userEmail: string;
      emailCount: number;
    }>;
  };
}

export interface EmailPerformanceMetrics {
  deliverabilityRate: number;
  bounceRate: number;
  averageDeliveryTime: number;
  peakSendingHours: Array<{
    hour: number;
    count: number;
  }>;
  templatePerformance: Array<{
    emailType: string;
    totalSent: number;
    successRate: number;
    averageDeliveryTime: number;
  }>;
}

export interface EmailTrendData {
  period: 'daily' | 'weekly' | 'monthly';
  data: Array<{
    period: string;
    sent: number;
    failed: number;
    successRate: number;
  }>;
}

class EmailAnalyticsService {

  /**
   * Get comprehensive email analytics
   */
  async getEmailAnalytics(options: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    emailType?: string;
  } = {}): Promise<EmailAnalytics> {
    try {
      const prisma = database.getPrisma();
      const { startDate, endDate, userId, emailType } = options;

      // Build where clause
      const whereClause: any = {};
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = startDate;
        if (endDate) whereClause.createdAt.lte = endDate;
      }
      if (userId) whereClause.userId = userId;
      if (emailType) whereClause.emailType = emailType;

      // Get basic counts
      const [totalEmails, sentEmails, failedEmails, pendingEmails] = await Promise.all([
        prisma.emailLog.count({ where: whereClause }),
        prisma.emailLog.count({ where: { ...whereClause, status: 'SENT' } }),
        prisma.emailLog.count({ where: { ...whereClause, status: 'FAILED' } }),
        prisma.emailLog.count({ where: { ...whereClause, status: 'PENDING' } }),
      ]);

      // Calculate rates
      const successRate = totalEmails > 0 ? (sentEmails / totalEmails) * 100 : 0;
      const failureRate = totalEmails > 0 ? (failedEmails / totalEmails) * 100 : 0;

      // Get emails by type
      const emailsByTypeRaw = await prisma.emailLog.groupBy({
        by: ['emailType'],
        where: whereClause,
        _count: true,
      });
      const emailsByType = emailsByTypeRaw.reduce((acc, item) => {
        acc[item.emailType] = item._count;
        return acc;
      }, {} as Record<string, number>);

      // Get emails by status
      const emailsByStatusRaw = await prisma.emailLog.groupBy({
        by: ['status'],
        where: whereClause,
        _count: true,
      });
      const emailsByStatus = emailsByStatusRaw.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>);

      // Get daily stats for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyStatsRaw = await prisma.$queryRaw`
        SELECT
          DATE(created_at) as date,
          COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
          COUNT(*) as total
        FROM email_logs
        WHERE created_at >= ${thirtyDaysAgo}
        ${whereClause.userId ? `AND user_id = '${whereClause.userId}'` : ''}
        ${whereClause.emailType ? `AND email_type = '${whereClause.emailType}'` : ''}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      ` as Array<{
        date: string;
        sent: number;
        failed: number;
        total: number;
      }>;

      // Get top failure reasons
      const topFailureReasonsRaw = await prisma.emailLog.groupBy({
        by: ['errorMessage'],
        where: {
          ...whereClause,
          status: 'FAILED',
          errorMessage: { not: null },
        },
        _count: true,
        orderBy: {
          _count: {
            errorMessage: 'desc',
          },
        },
        take: 10,
      });

      const topFailureReasons = topFailureReasonsRaw.map(item => ({
        reason: item.errorMessage || 'Unknown error',
        count: item._count,
        percentage: failedEmails > 0 ? (item._count / failedEmails) * 100 : 0,
      }));

      // Get user engagement data
      const uniqueRecipients = await prisma.emailLog.findMany({
        where: whereClause,
        select: { recipient: true },
        distinct: ['recipient'],
      });

      const averageEmailsPerUser = uniqueRecipients.length > 0
        ? totalEmails / uniqueRecipients.length
        : 0;

      const mostActiveUsersRaw = await prisma.emailLog.groupBy({
        by: ['userId', 'recipient'],
        where: {
          ...whereClause,
          userId: { not: null },
        },
        _count: true,
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 10,
      });

      const mostActiveUsers = mostActiveUsersRaw.map(item => ({
        userId: item.userId || '',
        userEmail: item.recipient,
        emailCount: item._count,
      }));

      return {
        totalEmails,
        sentEmails,
        failedEmails,
        pendingEmails,
        successRate: Math.round(successRate * 100) / 100,
        failureRate: Math.round(failureRate * 100) / 100,
        emailsByType,
        emailsByStatus,
        dailyStats: dailyStatsRaw,
        topFailureReasons,
        userEngagement: {
          uniqueRecipients: uniqueRecipients.length,
          averageEmailsPerUser: Math.round(averageEmailsPerUser * 100) / 100,
          mostActiveUsers,
        },
      };
    } catch (error) {
      logger.error('Failed to get email analytics:', error);
      throw error;
    }
  }

  /**
   * Get email performance metrics
   */
  async getEmailPerformanceMetrics(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<EmailPerformanceMetrics> {
    try {
      const prisma = database.getPrisma();
      const { startDate, endDate } = options;

      const whereClause: any = {};
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = startDate;
        if (endDate) whereClause.createdAt.lte = endDate;
      }

      // Calculate deliverability and bounce rates
      const [totalEmails, sentEmails, failedEmails] = await Promise.all([
        prisma.emailLog.count({ where: whereClause }),
        prisma.emailLog.count({ where: { ...whereClause, status: 'SENT' } }),
        prisma.emailLog.count({ where: { ...whereClause, status: 'FAILED' } }),
      ]);

      const deliverabilityRate = totalEmails > 0 ? (sentEmails / totalEmails) * 100 : 0;
      const bounceRate = totalEmails > 0 ? (failedEmails / totalEmails) * 100 : 0;

      // Calculate average delivery time (for sent emails)
      const sentEmailsWithTiming = await prisma.emailLog.findMany({
        where: {
          ...whereClause,
          status: 'SENT',
          sentAt: { not: null },
        },
        select: {
          createdAt: true,
          sentAt: true,
        },
      });

      let averageDeliveryTime = 0;
      if (sentEmailsWithTiming.length > 0) {
        const totalDeliveryTime = sentEmailsWithTiming.reduce((sum, email) => {
          const deliveryTime = email.sentAt!.getTime() - email.createdAt.getTime();
          return sum + deliveryTime;
        }, 0);
        averageDeliveryTime = totalDeliveryTime / sentEmailsWithTiming.length / 1000; // Convert to seconds
      }

      // Get peak sending hours
      const peakSendingHoursRaw = await prisma.$queryRaw`
        SELECT
          strftime('%H', created_at) as hour,
          COUNT(*) as count
        FROM email_logs
        WHERE status = 'SENT'
        ${startDate ? `AND created_at >= '${startDate.toISOString()}'` : ''}
        ${endDate ? `AND created_at <= '${endDate.toISOString()}'` : ''}
        GROUP BY strftime('%H', created_at)
        ORDER BY count DESC
      ` as Array<{ hour: string; count: number }>;

      const peakSendingHours = peakSendingHoursRaw.map(item => ({
        hour: parseInt(item.hour),
        count: item.count,
      }));

      // Get template performance
      const templatePerformanceRaw = await prisma.emailLog.groupBy({
        by: ['emailType'],
        where: whereClause,
        _count: true,
        _avg: {
          // We can't calculate delivery time directly in groupBy, so we'll calculate it separately
        },
      });

      const templatePerformance = await Promise.all(
        templatePerformanceRaw.map(async (template) => {
          const [totalSent, successfulSent, templateTimings] = await Promise.all([
            prisma.emailLog.count({
              where: { ...whereClause, emailType: template.emailType },
            }),
            prisma.emailLog.count({
              where: { ...whereClause, emailType: template.emailType, status: 'SENT' },
            }),
            prisma.emailLog.findMany({
              where: {
                ...whereClause,
                emailType: template.emailType,
                status: 'SENT',
                sentAt: { not: null },
              },
              select: {
                createdAt: true,
                sentAt: true,
              },
            }),
          ]);

          const successRate = totalSent > 0 ? (successfulSent / totalSent) * 100 : 0;

          let averageDeliveryTime = 0;
          if (templateTimings.length > 0) {
            const totalTime = templateTimings.reduce((sum, email) => {
              return sum + (email.sentAt!.getTime() - email.createdAt.getTime());
            }, 0);
            averageDeliveryTime = totalTime / templateTimings.length / 1000; // Convert to seconds
          }

          return {
            emailType: template.emailType,
            totalSent,
            successRate: Math.round(successRate * 100) / 100,
            averageDeliveryTime: Math.round(averageDeliveryTime * 100) / 100,
          };
        })
      );

      return {
        deliverabilityRate: Math.round(deliverabilityRate * 100) / 100,
        bounceRate: Math.round(bounceRate * 100) / 100,
        averageDeliveryTime: Math.round(averageDeliveryTime * 100) / 100,
        peakSendingHours,
        templatePerformance,
      };
    } catch (error) {
      logger.error('Failed to get email performance metrics:', error);
      throw error;
    }
  }

  /**
   * Get email trend data
   */
  async getEmailTrendData(
    period: 'daily' | 'weekly' | 'monthly',
    days: number = 30
  ): Promise<EmailTrendData> {
    try {
      const prisma = database.getPrisma();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let groupByFormat: string;
      let orderByFormat: string;

      switch (period) {
        case 'daily':
          groupByFormat = 'DATE(created_at)';
          orderByFormat = 'date';
          break;
        case 'weekly':
          groupByFormat = 'strftime("%Y-W%W", created_at)';
          orderByFormat = 'period';
          break;
        case 'monthly':
          groupByFormat = 'strftime("%Y-%m", created_at)';
          orderByFormat = 'period';
          break;
      }

      const trendDataRaw = await prisma.$queryRaw`
        SELECT
          ${groupByFormat} as period,
          COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
          COUNT(*) as total
        FROM email_logs
        WHERE created_at >= ${startDate}
        GROUP BY ${groupByFormat}
        ORDER BY ${orderByFormat} DESC
      ` as Array<{
        period: string;
        sent: number;
        failed: number;
        total: number;
      }>;

      const data = trendDataRaw.map(item => ({
        period: item.period,
        sent: item.sent,
        failed: item.failed,
        successRate: item.total > 0 ? Math.round((item.sent / item.total) * 10000) / 100 : 0,
      }));

      return { period, data };
    } catch (error) {
      logger.error('Failed to get email trend data:', error);
      throw error;
    }
  }

  /**
   * Get email delivery report
   */
  async getEmailDeliveryReport(options: {
    startDate?: Date;
    endDate?: Date;
    emailType?: string;
  } = {}): Promise<{
    summary: {
      totalEmails: number;
      deliveredEmails: number;
      failedEmails: number;
      deliveryRate: number;
    };
    details: Array<{
      date: string;
      emailType: string;
      recipient: string;
      status: string;
      sentAt: Date | null;
      errorMessage: string | null;
    }>;
  }> {
    try {
      const prisma = database.getPrisma();
      const { startDate, endDate, emailType } = options;

      const whereClause: any = {};
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = startDate;
        if (endDate) whereClause.createdAt.lte = endDate;
      }
      if (emailType) whereClause.emailType = emailType;

      // Get summary data
      const [totalEmails, deliveredEmails, failedEmails] = await Promise.all([
        prisma.emailLog.count({ where: whereClause }),
        prisma.emailLog.count({ where: { ...whereClause, status: 'SENT' } }),
        prisma.emailLog.count({ where: { ...whereClause, status: 'FAILED' } }),
      ]);

      const deliveryRate = totalEmails > 0 ? (deliveredEmails / totalEmails) * 100 : 0;

      // Get detailed data
      const details = await prisma.emailLog.findMany({
        where: whereClause,
        select: {
          createdAt: true,
          emailType: true,
          recipient: true,
          status: true,
          sentAt: true,
          errorMessage: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1000, // Limit to prevent large queries
      });

      const formattedDetails = details.map(item => ({
        date: item.createdAt.toISOString().split('T')[0],
        emailType: item.emailType,
        recipient: item.recipient,
        status: item.status,
        sentAt: item.sentAt,
        errorMessage: item.errorMessage,
      }));

      return {
        summary: {
          totalEmails,
          deliveredEmails,
          failedEmails,
          deliveryRate: Math.round(deliveryRate * 100) / 100,
        },
        details: formattedDetails,
      };
    } catch (error) {
      logger.error('Failed to get email delivery report:', error);
      throw error;
    }
  }

  /**
   * Get email campaign performance
   */
  async getCampaignPerformance(campaignId?: string): Promise<{
    campaigns: Array<{
      emailType: string;
      totalSent: number;
      successRate: number;
      failureRate: number;
      averageDeliveryTime: number;
      lastSent: Date | null;
    }>;
  }> {
    try {
      const prisma = database.getPrisma();

      const whereClause: any = {};
      if (campaignId) whereClause.emailType = campaignId;

      const campaignStats = await prisma.emailLog.groupBy({
        by: ['emailType'],
        where: whereClause,
        _count: true,
        _max: {
          sentAt: true,
        },
      });

      const campaigns = await Promise.all(
        campaignStats.map(async (campaign) => {
          const [totalSent, successfulSent, failedSent, deliveryTimings] = await Promise.all([
            prisma.emailLog.count({
              where: { emailType: campaign.emailType },
            }),
            prisma.emailLog.count({
              where: { emailType: campaign.emailType, status: 'SENT' },
            }),
            prisma.emailLog.count({
              where: { emailType: campaign.emailType, status: 'FAILED' },
            }),
            prisma.emailLog.findMany({
              where: {
                emailType: campaign.emailType,
                status: 'SENT',
                sentAt: { not: null },
              },
              select: {
                createdAt: true,
                sentAt: true,
              },
            }),
          ]);

          const successRate = totalSent > 0 ? (successfulSent / totalSent) * 100 : 0;
          const failureRate = totalSent > 0 ? (failedSent / totalSent) * 100 : 0;

          let averageDeliveryTime = 0;
          if (deliveryTimings.length > 0) {
            const totalTime = deliveryTimings.reduce((sum, email) => {
              return sum + (email.sentAt!.getTime() - email.createdAt.getTime());
            }, 0);
            averageDeliveryTime = totalTime / deliveryTimings.length / 1000; // Convert to seconds
          }

          return {
            emailType: campaign.emailType,
            totalSent,
            successRate: Math.round(successRate * 100) / 100,
            failureRate: Math.round(failureRate * 100) / 100,
            averageDeliveryTime: Math.round(averageDeliveryTime * 100) / 100,
            lastSent: campaign._max.sentAt,
          };
        })
      );

      return { campaigns };
    } catch (error) {
      logger.error('Failed to get campaign performance:', error);
      throw error;
    }
  }

  /**
   * Export analytics data to CSV
   */
  async exportAnalyticsToCSV(options: {
    startDate?: Date;
    endDate?: Date;
    emailType?: string;
  } = {}): Promise<string> {
    try {
      const prisma = database.getPrisma();
      const { startDate, endDate, emailType } = options;

      const whereClause: any = {};
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = startDate;
        if (endDate) whereClause.createdAt.lte = endDate;
      }
      if (emailType) whereClause.emailType = emailType;

      const emails = await prisma.emailLog.findMany({
        where: whereClause,
        select: {
          id: true,
          emailType: true,
          recipient: true,
          subject: true,
          status: true,
          createdAt: true,
          sentAt: true,
          errorMessage: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Create CSV content
      const headers = ['ID', 'Email Type', 'Recipient', 'Subject', 'Status', 'Created At', 'Sent At', 'Error Message'];
      const csvContent = [
        headers.join(','),
        ...emails.map(email => [
          email.id,
          `"${email.emailType}"`,
          `"${email.recipient}"`,
          `"${email.subject}"`,
          email.status,
          email.createdAt.toISOString(),
          email.sentAt?.toISOString() || '',
          `"${email.errorMessage || ''}"`,
        ].join(','))
      ].join('\n');

      return csvContent;
    } catch (error) {
      logger.error('Failed to export analytics to CSV:', error);
      throw error;
    }
  }
}

export const emailAnalyticsService = new EmailAnalyticsService();
export default emailAnalyticsService;