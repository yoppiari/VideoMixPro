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
import paymentRoutes from '@/routes/payment.routes';
import adminRoutes from '@/routes/admin.routes';
import healthRoutes from '@/routes/health';
import groupRoutes from '@/routes/group.routes';

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
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/processing', processingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);

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
  ResponseHelper.serverError(res, 'Something went wrong');
});

const startServer = async (): Promise<void> => {
  try {
    await database.connect();
    logger.info('Database connected successfully');

    // Start production services
    if (process.env.NODE_ENV === 'production') {
      cleanupService.start();
      backupService.start();
      logger.info('Production services started (cleanup & backup)');
    }

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