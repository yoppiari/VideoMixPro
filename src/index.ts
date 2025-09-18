import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import { database } from '@/utils/database';

import logger from '@/utils/logger';
import { ResponseHelper } from '@/utils/response';
import authRoutes from '@/routes/auth.routes';
import userRoutes from '@/routes/user.routes';
import projectRoutes from '@/routes/project.routes';
import videoRoutes from '@/routes/video.routes';
import processingRoutes from '@/routes/processing.routes';

config();

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/videos', videoRoutes);
app.use('/api/v1/processing', processingRoutes);

app.get('/health', (req, res) => {
  ResponseHelper.success(res, { status: 'healthy', timestamp: new Date().toISOString() });
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
  await database.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await database.disconnect();
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

export { app, database };