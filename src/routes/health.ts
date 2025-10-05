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

// Debug login endpoint - REMOVE IN PRODUCTION
router.post('/debug-login', async (req, res) => {
  try {
    const bcrypt = await import('bcryptjs');
    const jwt = await import('jsonwebtoken');
    const { prisma } = await import('@/utils/database');
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
});

export default router;