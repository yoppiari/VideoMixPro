import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { ResponseHelper } from '@/utils/response';
import { AuthTokenPayload, LicenseType } from '@/types';
import { database, prisma } from '@/utils/database';
import logger from '@/utils/logger';

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        ResponseHelper.error(res, 'Email already registered', 409);
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          credits: 10, // Welcome credits
          licenseType: LicenseType.FREE
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          credits: true,
          licenseType: true,
          createdAt: true
        }
      });

      const token = this.generateToken(user.id, user.email, user.licenseType as LicenseType);

      ResponseHelper.success(res, { user, token }, 'Registration successful', 201);
    } catch (error) {
      logger.error('Registration error:', error);
      ResponseHelper.serverError(res, 'Registration failed');
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user || !user.isActive) {
        ResponseHelper.unauthorized(res, 'Invalid credentials');
        return;
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        ResponseHelper.unauthorized(res, 'Invalid credentials');
        return;
      }

      if (user.licenseExpiry && user.licenseExpiry < new Date()) {
        ResponseHelper.unauthorized(res, 'License expired');
        return;
      }

      const token = this.generateToken(user.id, user.email, user.licenseType as LicenseType);

      const userData = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        credits: user.credits,
        licenseType: user.licenseType,
        licenseExpiry: user.licenseExpiry
      };

      ResponseHelper.success(res, { user: userData, token }, 'Login successful');
    } catch (error) {
      logger.error('Login error:', error);
      ResponseHelper.serverError(res, 'Login failed');
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        ResponseHelper.unauthorized(res, 'Refresh token required');
        return;
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        ResponseHelper.serverError(res, 'Authentication configuration error');
        return;
      }

      const decoded = jwt.verify(token, secret) as AuthTokenPayload;

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          isActive: true,
          licenseType: true,
          licenseExpiry: true
        }
      });

      if (!user || !user.isActive) {
        ResponseHelper.unauthorized(res, 'Invalid user');
        return;
      }

      const newToken = this.generateToken(user.id, user.email, user.licenseType as LicenseType);

      ResponseHelper.success(res, { token: newToken }, 'Token refreshed');
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        ResponseHelper.unauthorized(res, 'Invalid refresh token');
        return;
      }

      logger.error('Token refresh error:', error);
      ResponseHelper.serverError(res, 'Token refresh failed');
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    ResponseHelper.success(res, null, 'Logout successful');
  }

  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          credits: true,
          licenseType: true,
          licenseExpiry: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user || !user.isActive) {
        ResponseHelper.unauthorized(res, 'User not found or inactive');
        return;
      }

      ResponseHelper.success(res, user, 'Profile retrieved successfully');
    } catch (error) {
      logger.error('Get profile error:', error);
      ResponseHelper.serverError(res, 'Failed to retrieve profile');
    }
  }

  async verifyLicense(req: Request, res: Response): Promise<void> {
    try {
      const { licenseKey, machineId, appVersion } = req.body;

      // In production, this would call an external license verification service
      // For now, we'll simulate the verification process

      const user = await prisma.user.findFirst({
        where: {
          // In production, you'd match by license key or similar identifier
          isActive: true
        }
      });

      if (!user) {
        ResponseHelper.unauthorized(res, 'Invalid license');
        return;
      }

      if (user.licenseExpiry && user.licenseExpiry < new Date()) {
        ResponseHelper.unauthorized(res, 'License expired');
        return;
      }

      const licType = user.licenseType as LicenseType;
      const features = this.getLicenseFeatures(licType);

      ResponseHelper.success(res, {
        valid: true,
        licenseType: user.licenseType,
        expiry: user.licenseExpiry,
        features,
        maxProjects: this.getMaxProjects(licType),
        maxCredits: this.getMaxCredits(licType)
      }, 'License verified');
    } catch (error) {
      logger.error('License verification error:', error);
      ResponseHelper.serverError(res, 'License verification failed');
    }
  }

  private generateToken(userId: string, email: string, licenseType: LicenseType): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const payload = {
      userId,
      email,
      licenseType
    };

    return jwt.sign(payload, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' } as any);
  }

  private getLicenseFeatures(licenseType: LicenseType): string[] {
    switch (licenseType) {
      case LicenseType.FREE:
        return ['basic_mixing', 'auto_mode'];
      case LicenseType.PREMIUM:
        return ['basic_mixing', 'auto_mode', 'manual_mode', 'metadata_embedding', 'cloud_processing'];
      case LicenseType.ENTERPRISE:
        return ['basic_mixing', 'auto_mode', 'manual_mode', 'metadata_embedding', 'cloud_processing', 'bulk_operations', 'api_access'];
      default:
        return [];
    }
  }

  private getMaxProjects(licenseType: LicenseType): number {
    switch (licenseType) {
      case LicenseType.FREE:
        return 3;
      case LicenseType.PREMIUM:
        return 50;
      case LicenseType.ENTERPRISE:
        return -1; // Unlimited
      default:
        return 1;
    }
  }

  private getMaxCredits(licenseType: LicenseType): number {
    switch (licenseType) {
      case LicenseType.FREE:
        return 100;
      case LicenseType.PREMIUM:
        return 10000;
      case LicenseType.ENTERPRISE:
        return -1; // Unlimited
      default:
        return 10;
    }
  }
}