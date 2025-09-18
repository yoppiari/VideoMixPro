import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { validateRequest } from '@/middleware/validation.middleware';
import { UserRegistrationSchema, UserLoginSchema, LicenseVerificationSchema } from '@/utils/validation';

const router = Router();
const authController = new AuthController();

router.post('/register', validateRequest(UserRegistrationSchema), authController.register);
router.post('/login', validateRequest(UserLoginSchema), authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/verify-license', validateRequest(LicenseVerificationSchema), authController.verifyLicense);

export default router;