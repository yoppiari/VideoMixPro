import { Router } from 'express';
import { ProjectController } from '@/controllers/project.controller';
import { authenticateToken } from '@/middleware/auth.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { ProjectCreateSchema, ProjectUpdateSchema, PaginationSchema } from '@/utils/validation';

const router = Router();
const projectController = new ProjectController();

router.use(authenticateToken);

router.get('/', validateRequest(PaginationSchema, 'query'), projectController.getProjects);
router.post('/', validateRequest(ProjectCreateSchema), projectController.createProject);
router.get('/:id', projectController.getProject);
router.put('/:id', validateRequest(ProjectUpdateSchema), projectController.updateProject);
router.delete('/:id', projectController.deleteProject);
router.post('/:id/groups', projectController.createGroup);
router.put('/:id/groups/:groupId', projectController.updateGroup);
router.delete('/:id/groups/:groupId', projectController.deleteGroup);

export default router;