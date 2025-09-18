import request from 'supertest';
import { app } from '@/index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Authentication Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database
    await prisma.$connect();
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test'
        }
      }
    });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test users before each test
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test'
        }
      }
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Registration successful',
        data: {
          user: {
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            credits: 10
          },
          token: expect.any(String)
        }
      });

      // Verify user was created in database
      const user = await prisma.user.findUnique({
        where: { email: userData.email }
      });
      expect(user).toBeTruthy();
      expect(user?.firstName).toBe(userData.firstName);
    });

    it('should return 409 for duplicate email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe'
      };

      // Create user first
      await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      // Try to create again
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Email already registered'
      });
    });

    it('should return 422 for invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(422);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Validation failed'
      });
    });

    it('should return 422 for short password', async () => {
      const userData = {
        email: 'test2@example.com',
        password: '123',
        firstName: 'John',
        lastName: 'Doe'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(422);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Validation failed'
      });
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let testUser: any;

    beforeEach(async () => {
      // Create a test user for login tests
      const userData = {
        email: 'testlogin@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData);

      testUser = response.body.data.user;
    });

    it('should login with valid credentials', async () => {
      const loginData = {
        email: 'testlogin@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            email: loginData.email,
            firstName: 'Test',
            lastName: 'User'
          },
          token: expect.any(String)
        }
      });
    });

    it('should return 401 for invalid credentials', async () => {
      const loginData = {
        email: 'testlogin@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid credentials'
      });
    });

    it('should return 401 for non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid credentials'
      });
    });

    it('should return 422 for invalid email format', async () => {
      const loginData = {
        email: 'invalid-email',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(422);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Validation failed'
      });
    });
  });

  describe('POST /api/v1/auth/verify-license', () => {
    it('should verify license successfully', async () => {
      const licenseData = {
        licenseKey: 'valid-license-key',
        machineId: 'machine-123',
        appVersion: '1.0.0'
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-license')
        .send(licenseData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'License verified',
        data: {
          valid: true,
          licenseType: expect.any(String),
          features: expect.any(Array)
        }
      });
    });

    it('should return 422 for missing license key', async () => {
      const licenseData = {
        machineId: 'machine-123',
        appVersion: '1.0.0'
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-license')
        .send(licenseData)
        .expect(422);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Validation failed'
      });
    });
  });
});