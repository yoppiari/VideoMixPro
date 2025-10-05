import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { database } from '@/utils/database';

import logger from '@/utils/logger';
import { ResponseHelper } from '@/utils/response';
import authRoutes from '@/routes/auth.routes';
import userRoutes from '@/routes/user.routes';
import projectRoutes from '@/routes/project.routes';
import videoRoutes from '@/routes/video.routes';
import processingRoutes from '@/routes/processing.routes';
// import paymentRoutes from '@/routes/payment.routes'; // Disabled - missing Payment model
// import adminRoutes from '@/routes/admin.routes'; // Disabled - missing EmailLog/Payment models
import healthRoutes from '@/routes/health';
// import groupRoutes from '@/routes/group.routes'; // Disabled - missing VideoFile model
import voiceOverRoutes from '@/routes/voice-over.routes';

// Production services
import {
  securityHeaders,
  generalRateLimit,
  authRateLimit,
  sanitizeInput,
  requestLogger,
  securityAudit,
  corsOptions
} from '@/middleware/security';
import { cleanupService } from '@/services/cleanupService';
import { backupService } from '@/services/backupService';

config();

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(requestLogger);
app.use(securityAudit);
app.use(sanitizeInput);
app.use(generalRateLimit);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Apply auth rate limiting to auth routes
app.use('/api/v1/auth', authRateLimit, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/videos', videoRoutes);
// app.use('/api/v1/groups', groupRoutes); // Disabled - missing VideoFile model
app.use('/api/v1/processing', processingRoutes);
app.use('/api/v1/voiceover', voiceOverRoutes);
// app.use('/api/v1/payments', paymentRoutes); // Disabled - missing Payment model
// app.use('/api/v1/admin', adminRoutes); // Disabled - missing EmailLog/Payment models

// Health check endpoints
app.use('/', healthRoutes);

// API Info endpoint for root path
app.get('/', (req, res) => {
  const apiInfo = {
    success: true,
    message: 'VideoMixPro API Server',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      api: '/api/v1',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      projects: '/api/v1/projects',
      videos: '/api/v1/videos',
      processing: '/api/v1/processing',
      payments: '/api/v1/payments',
      admin: '/api/v1/admin'
    },
    frontend: process.env.FRONTEND_URL || 'http://localhost:3001',
    timestamp: new Date().toISOString()
  };
  res.json(apiInfo);
});

app.use('*', (req, res) => {
  ResponseHelper.notFound(res, 'Endpoint not found');
});

app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  logger.error('Error stack:', error.stack);

  // Temporary debug mode - REMOVE IN PRODUCTION
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      success: false,
      error: 'Something went wrong',
      debug: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  } else {
    ResponseHelper.serverError(res, 'Something went wrong');
  }
});

const startServer = async (): Promise<void> => {
  try {
    await database.connect();
    logger.info('Database connected successfully');

    // Clean up stale jobs from previous sessions
    // await cleanupStaleJobs(); // Disabled - schema mismatch with project.status field

    // Start production services
    // if (process.env.NODE_ENV === 'production') {
    //   cleanupService.start();
    //   backupService.start();
    //   logger.info('Production services started (cleanup & backup)');
    // }

    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Database: ${database.isDev() ? 'SQLite (Development)' : 'PostgreSQL (Production)'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Clean up stale jobs from previous server sessions
const cleanupStaleJobs = async (): Promise<void> => {
  try {
    const prisma = await database.connect();

    // Find all jobs that were processing when server was shut down
    const staleJobs = await prisma.processingJob.findMany({
      where: {
        status: 'PROCESSING'
      },
      select: {
        id: true,
        projectId: true
      }
    });

    if (staleJobs.length > 0) {
      logger.info(`Found ${staleJobs.length} stale processing jobs from previous session`);

      // Mark them as failed or cancelled
      await prisma.processingJob.updateMany({
        where: {
          status: 'PROCESSING'
        },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: 'Job interrupted by server restart'
        }
      });

      // Update associated projects back to DRAFT
      // DISABLED: Project status field doesn't exist in schema
      // const projectIds = [...new Set(staleJobs.map(job => job.projectId))];
      // await prisma.project.updateMany({
      //   where: {
      //     id: { in: projectIds }
      //   },
      //   data: {
      //     status: 'DRAFT'
      //   }
      // });

      logger.info(`Cleaned up ${staleJobs.length} stale jobs`);
    }

    // Also clean up any cancelled jobs that might have been stuck
    const cancelledButProcessing = await prisma.processingJob.findMany({
      where: {
        status: 'CANCELLED',
        completedAt: null
      }
    });

    if (cancelledButProcessing.length > 0) {
      await prisma.processingJob.updateMany({
        where: {
          status: 'CANCELLED',
          completedAt: null
        },
        data: {
          completedAt: new Date()
        }
      });
      logger.info(`Fixed ${cancelledButProcessing.length} cancelled jobs with missing completion time`);
    }
  } catch (error) {
    logger.error('Failed to clean up stale jobs:', error);
    // Don't prevent server startup on cleanup failure
  }
};

process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');

  // Stop production services
  if (process.env.NODE_ENV === 'production') {
    cleanupService.stop();
    backupService.stop();
    logger.info('Production services stopped');
  }

  await database.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');

  // Stop production services
  if (process.env.NODE_ENV === 'production') {
    cleanupService.stop();
    backupService.stop();
    logger.info('Production services stopped');
  }

  await database.disconnect();
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

export { app, database };