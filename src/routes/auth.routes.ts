import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { authenticateToken } from '@/middleware/auth.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { UserRegistrationSchema, UserLoginSchema, LicenseVerificationSchema } from '@/utils/validation';

const router = Router();
const authController = new AuthController();

router.post('/register', validateRequest(UserRegistrationSchema), authController.register.bind(authController));
router.post('/login', validateRequest(UserLoginSchema), authController.login.bind(authController));
router.post('/refresh', authController.refreshToken.bind(authController));
router.post('/logout', authController.logout.bind(authController));
router.post('/verify-license', validateRequest(LicenseVerificationSchema), authController.verifyLicense.bind(authController));
router.get('/profile', authenticateToken, authController.getProfile.bind(authController));

export default router;