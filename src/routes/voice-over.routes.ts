import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { voiceOverController } from '../controllers/voice-over.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Upload voice over files for a project
router.post(
  '/projects/:projectId/voiceovers',
  voiceOverController.uploadMiddleware,
  voiceOverController.uploadVoiceOvers.bind(voiceOverController)
);

// Get voice over files for a project
router.get(
  '/projects/:projectId/voiceovers',
  voiceOverController.getProjectVoiceOvers.bind(voiceOverController)
);

// Update voice over order
router.put(
  '/projects/:projectId/voiceovers/order',
  voiceOverController.updateVoiceOverOrder.bind(voiceOverController)
);

// Delete a voice over file
router.delete(
  '/voiceovers/:voiceOverId',
  voiceOverController.deleteVoiceOver.bind(voiceOverController)
);

// Get estimated duration
router.get(
  '/projects/:projectId/voiceovers/estimate',
  voiceOverController.getEstimatedDuration.bind(voiceOverController)
);

export default router;