import { Router } from 'express';
import { ProcessingController } from '@/controllers/processing.controller';
import { authenticateToken } from '@/middleware/auth.middleware';

const router = Router();
const processingController = new ProcessingController();

router.use(authenticateToken);

router.post('/start/:projectId', processingController.startProcessing.bind(processingController));
router.get('/status/:jobId', processingController.getJobStatus.bind(processingController));
router.get('/job/:jobId/details', processingController.getJobDetails.bind(processingController));
router.post('/cancel/:jobId', processingController.cancelJob.bind(processingController));
router.post('/credits-estimate', processingController.getCreditsEstimate.bind(processingController));
router.get('/jobs', processingController.getUserJobs.bind(processingController));
router.get('/project/:projectId/jobs', processingController.getProjectJobs.bind(processingController));
router.get('/outputs/:jobId', processingController.getJobOutputs.bind(processingController));
router.get('/download/:outputId', processingController.downloadOutput.bind(processingController));

export default router;