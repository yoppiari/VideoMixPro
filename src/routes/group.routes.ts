import { Router } from 'express';
import { GroupController } from '@/controllers/group.controller';
import { authenticateToken } from '@/middleware/auth.middleware';

const router = Router();
const groupController = new GroupController();

router.use(authenticateToken);

router.post('/', groupController.createGroup.bind(groupController));
router.patch('/:groupId', groupController.updateGroup.bind(groupController));
router.delete('/:groupId', groupController.deleteGroup.bind(groupController));
router.get('/project/:projectId', groupController.getProjectGroups.bind(groupController));
router.post('/project/:projectId/reorder', groupController.reorderGroups.bind(groupController));

export default router;