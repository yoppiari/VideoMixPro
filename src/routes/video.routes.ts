import { Router } from 'express';
import { VideoController } from '@/controllers/video.controller';
import { authenticateToken } from '@/middleware/auth.middleware';
import { uploadMiddleware } from '@/middleware/upload.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { VideoUploadSchema } from '@/utils/validation';

const router = Router();
const videoController = new VideoController();

router.use(authenticateToken);

router.post('/upload', uploadMiddleware.array('videos', 50), validateRequest(VideoUploadSchema), videoController.uploadVideos);
router.get('/project/:projectId', videoController.getProjectVideos);
router.delete('/:id', videoController.deleteVideo);
router.get('/:id/metadata', videoController.getVideoMetadata);

export default router;