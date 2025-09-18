import { Router } from 'express';
import { ProcessingController } from '@/controllers/processing.controller';
import { authenticateToken } from '@/middleware/auth.middleware';

const router = Router();
const processingController = new ProcessingController();

router.use(authenticateToken);

router.post('/start/:projectId', processingController.startProcessing);
router.get('/status/:jobId', processingController.getJobStatus);
router.post('/cancel/:jobId', processingController.cancelJob);
router.get('/jobs', processingController.getUserJobs);
router.get('/outputs/:jobId', processingController.getJobOutputs);
router.get('/download/:outputId', processingController.downloadOutput);

export default router;