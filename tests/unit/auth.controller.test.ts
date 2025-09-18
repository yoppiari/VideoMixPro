import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthController } from '@/controllers/auth.controller';
import { PrismaClient } from '@prisma/client';
import { LicenseType } from '@/types';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('@/utils/logger');

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn()
  }
} as any;

(PrismaClient as jest.Mock).mockImplementation(() => mockPrisma);

describe('AuthController', () => {
  let authController: AuthController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    authController = new AuthController();
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe'
      };

      mockRequest.body = userData;

      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-id-123',
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        credits: 10,
        licenseType: LicenseType.FREE,
        createdAt: new Date()
      });
      (jwt.sign as jest.Mock).mockReturnValue('jwt-token');

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: userData.email }
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, 12);
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          user: expect.any(Object),
          token: 'jwt-token'
        }),
        message: 'Registration successful'
      });
    });

    it('should return error if email already exists', async () => {
      mockRequest.body = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe'
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email already registered'
      });
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      mockRequest.body = loginData;

      const mockUser = {
        id: 'user-id-123',
        email: loginData.email,
        password: 'hashedPassword',
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        credits: 50,
        licenseType: LicenseType.PREMIUM,
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('jwt-token');

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email }
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(loginData.password, mockUser.password);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          user: expect.objectContaining({
            id: mockUser.id,
            email: mockUser.email
          }),
          token: 'jwt-token'
        }),
        message: 'Login successful'
      });
    });

    it('should return error for invalid credentials', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        password: 'hashedPassword',
        isActive: true
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid credentials'
      });
    });

    it('should return error for inactive user', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        isActive: false
      });

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid credentials'
      });
    });

    it('should return error for expired license', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        password: 'hashedPassword',
        isActive: true,
        licenseExpiry: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'License expired'
      });
    });
  });

  describe('verifyLicense', () => {
    it('should verify valid license', async () => {
      mockRequest.body = {
        licenseKey: 'valid-license-key',
        machineId: 'machine-123',
        appVersion: '1.0.0'
      };

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-id',
        licenseType: LicenseType.PREMIUM,
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isActive: true
      });

      await authController.verifyLicense(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          valid: true,
          licenseType: LicenseType.PREMIUM,
          features: expect.arrayContaining(['basic_mixing', 'auto_mode', 'manual_mode'])
        }),
        message: 'License verified'
      });
    });

    it('should return error for expired license in verification', async () => {
      mockRequest.body = {
        licenseKey: 'expired-license-key',
        machineId: 'machine-123',
        appVersion: '1.0.0'
      };

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-id',
        licenseType: LicenseType.PREMIUM,
        licenseExpiry: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        isActive: true
      });

      await authController.verifyLicense(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'License expired'
      });
    });
  });
});