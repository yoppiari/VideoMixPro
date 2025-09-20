import { Router } from 'express';
import { healthService } from '../services/healthService';

const router = Router();

// Health check endpoint
router.get('/health', healthService.handleHealthCheck.bind(healthService));

// Kubernetes readiness probe
router.get('/ready', healthService.handleReadinessCheck.bind(healthService));

// Kubernetes liveness probe
router.get('/live', healthService.handleLivenessCheck.bind(healthService));

export default router;