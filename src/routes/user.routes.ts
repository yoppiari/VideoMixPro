import { Router } from 'express';
import { UserController } from '@/controllers/user.controller';
import { authenticateToken } from '@/middleware/auth.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { CreditPurchaseSchema } from '@/utils/validation';

const router = Router();
const userController = new UserController();

router.use(authenticateToken);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.get('/credits', userController.getCredits);
router.post('/credits/purchase', validateRequest(CreditPurchaseSchema), userController.purchaseCredits);
router.get('/transactions', userController.getTransactions);

export default router;