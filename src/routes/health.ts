import { Router } from 'express';
import { healthService } from '../services/healthService';

const router = Router();

// Health check endpoint
router.get('/health', healthService.handleHealthCheck.bind(healthService));

// Kubernetes readiness probe
router.get('/ready', healthService.handleReadinessCheck.bind(healthService));

// Kubernetes liveness probe
router.get('/live', healthService.handleLivenessCheck.bind(healthService));

// Debug endpoint - REMOVE IN PRODUCTION
router.get('/debug-env', (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    DATABASE_PROVIDER: process.env.DATABASE_PROVIDER,
    DATABASE_URL_SET: !!process.env.DATABASE_URL,
    DATABASE_URL_PREFIX: process.env.DATABASE_URL?.substring(0, 30) + '...',
    JWT_SECRET_SET: !!process.env.JWT_SECRET,
    JWT_SECRET_PREFIX: process.env.JWT_SECRET?.substring(0, 20) + '...',
    FRONTEND_URL: process.env.FRONTEND_URL,
    DOCKER_ENV: process.env.DOCKER_ENV
  });
});

export default router;