import { Router } from 'express';
import { GroupController } from '@/controllers/group.controller';
import { authenticateToken } from '@/middleware/auth.middleware';

const router = Router();
const groupController = new GroupController();

router.use(authenticateToken);

router.post('/', groupController.createGroup);
router.patch('/:groupId', groupController.updateGroup);
router.delete('/:groupId', groupController.deleteGroup);
router.get('/project/:projectId', groupController.getProjectGroups);
router.post('/project/:projectId/reorder', groupController.reorderGroups);

export default router;