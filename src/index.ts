import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { database, prisma } from '@/utils/database';

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
// import voiceOverRoutes from '@/routes/voice-over.routes'; // Disabled - incomplete implementation

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
// import { cleanupService } from '@/services/cleanupService'; // Disabled - excluded from build
// import { backupService } from '@/services/backupService'; // Disabled - excluded from build

config();

const app = express();
const port = process.env.PORT || 3000;

// DEBUG ENDPOINTS - DEVELOPMENT ONLY
if (process.env.NODE_ENV === 'development') {
  app.use(express.json());
  app.post('/api/emergency-login', (req, res, next) => {
    (async () => {
      try {
        const bcrypt = await import('bcryptjs');
        const jwt = await import('jsonwebtoken');
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          return res.json({ success: false, error: 'User not found', debug: 'user_not_found' });
        }

        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
          return res.json({ success: false, error: 'Invalid password', debug: 'password_mismatch' });
        }

        const token = jwt.sign(
          { userId: user.id, email: user.email, licenseType: user.licenseType },
          process.env.JWT_SECRET || 'fallback-secret',
          { expiresIn: '24h' }
        );

        res.json({
          success: true,
          user: { id: user.id, email: user.email },
          token,
          debug: 'login_successful'
        });
      } catch (error) {
        res.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'No stack',
          debug: 'exception_caught'
        });
      }
    })().catch(next);
  });
}

// Security middleware
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(requestLogger);
app.use(securityAudit);
app.use(sanitizeInput);
app.use(generalRateLimit);

// Body parsing middleware - Allow large video uploads
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// DEBUG ENDPOINTS - DEVELOPMENT ONLY
if (process.env.NODE_ENV === 'development') {
  app.post('/api/test', (req, res) => {
    res.json({ success: true, message: 'Test endpoint works', body: req.body });
  });

  app.post('/api/debug-login', async (req, res) => {
    try {
      const bcrypt = await import('bcryptjs');
      const jwt = await import('jsonwebtoken');
      const { email, password } = req.body;

      logger.info('[DEBUG LOGIN] Request received:', { email });

      const user = await prisma.user.findUnique({ where: { email } });
      logger.info('[DEBUG LOGIN] User found:', !!user);

      if (!user) {
        return res.json({ success: false, error: 'User not found', debug: 'user_not_found' });
      }

      const isValid = await bcrypt.compare(password, user.password);
      logger.info('[DEBUG LOGIN] Password valid:', isValid);

      if (!isValid) {
        return res.json({ success: false, error: 'Invalid password', debug: 'password_mismatch' });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, licenseType: user.licenseType },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        user: { id: user.id, email: user.email },
        token,
        debug: 'login_successful'
      });
    } catch (error) {
      logger.error('[DEBUG LOGIN] Error:', error);
      res.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack',
        debug: 'exception_caught'
      });
    }
  });
}

// Apply auth rate limiting to auth routes
app.use('/api/v1/auth', authRateLimit, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/videos', videoRoutes);
// app.use('/api/v1/groups', groupRoutes); // Disabled - missing VideoFile model
app.use('/api/v1/processing', processingRoutes);
// app.use('/api/v1/voiceover', voiceOverRoutes); // Disabled - incomplete implementation
// app.use('/api/v1/payments', paymentRoutes); // Disabled - missing Payment model
// app.use('/api/v1/admin', adminRoutes); // Disabled - missing EmailLog/Payment models

// Health check endpoints
app.use('/', healthRoutes);

// API Info endpoint for root path
app.get('/', (req, res) => {
  const apiInfo = {
    success: true,
    message: 'VideoMixPro API Server - CORS FIXED',
    version: '1.0.1',
    environment: process.env.NODE_ENV || 'development',
    corsEnabled: true,
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

app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  logger.error('Error stack:', error.stack);

  // Handle Multer errors specifically
  if (error.name === 'MulterError') {
    let message = 'File upload error';
    let statusCode = 400;

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        let maxSize = process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE) : 524288000;
        // Safety check for invalid values
        if (!maxSize || maxSize <= 0 || isNaN(maxSize)) {
          maxSize = 524288000; // 500MB default
        }
        message = `File too large. Maximum size is ${Math.floor(maxSize / 1024 / 1024)}MB per file`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Maximum is 50 files';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name too long';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value too long';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts in multipart form';
        break;
      default:
        message = error.message || 'File upload error';
    }

    return res.status(statusCode).json({
      success: false,
      error: message,
      code: error.code
    });
  }

  // Generic error handler
  res.status(500).json({
    success: false,
    error: error.message || 'Unknown error',
    name: error.name || 'Error',
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    details: process.env.NODE_ENV === 'development' ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : undefined
  });
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

  // Stop production services - DISABLED
  // if (process.env.NODE_ENV === 'production') {
  //   cleanupService.stop();
  //   backupService.stop();
  //   logger.info('Production services stopped');
  // }

  await database.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');

  // Stop production services - DISABLED
  // if (process.env.NODE_ENV === 'production') {
  //   cleanupService.stop();
  //   backupService.stop();
  //   logger.info('Production services stopped');
  // }

  await database.disconnect();
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

export { app, database };