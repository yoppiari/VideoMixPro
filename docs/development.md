# Development Workflow & Coding Standards

## Overview

This document outlines the development workflow, coding standards, and best practices for the Video Mixer Pro project. Following these guidelines ensures code consistency, maintainability, and team collaboration efficiency.

## Development Environment Setup

### Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] PostgreSQL 13+ running locally
- [ ] Redis 6+ running locally
- [ ] FFmpeg 4.4+ installed
- [ ] Git configured with SSH keys
- [ ] VS Code with recommended extensions

### Recommended VS Code Extensions

Create `.vscode/extensions.json`:
```json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "Prisma.prisma",
    "ms-vscode.test-adapter-converter",
    "hbenl.vscode-test-explorer",
    "ms-vscode.vscode-jest"
  ]
}
```

### Local Development Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd VideoMixPro
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your local settings
   ```

3. **Database Setup**
   ```bash
   # Start PostgreSQL and Redis
   # Create database: videomixpro
   npm run db:migrate
   npm run db:generate
   ```

4. **Start Development Servers**
   ```bash
   # Terminal 1: API Server
   npm run dev

   # Terminal 2: Background Workers
   npm run queue:dev

   # Terminal 3: Database Studio (optional)
   npm run db:studio
   ```

## Git Workflow

### Branch Strategy

We use **Git Flow** with the following branch structure:

```
main (production)
├── develop (integration)
├── feature/feature-name
├── hotfix/bug-name
└── release/version-number
```

### Branch Naming Convention

- `feature/user-authentication`
- `feature/video-processing-queue`
- `bugfix/file-upload-validation`
- `hotfix/security-patch`
- `release/v1.2.0`

### Commit Message Format

Follow **Conventional Commits** specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(auth): add JWT token refresh functionality
fix(upload): resolve file validation error handling
docs(api): update endpoint documentation
test(processing): add unit tests for video service
chore: update dependencies to latest versions
```

### Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. **Development & Testing**
   ```bash
   # Make changes
   npm run test
   npm run lint
   npm run typecheck
   ```

3. **Commit & Push**
   ```bash
   git add .
   git commit -m "feat(scope): description"
   git push origin feature/your-feature-name
   ```

4. **Create Pull Request**
   - Target: `develop` branch
   - Use PR template
   - Add reviewers
   - Link related issues

5. **Code Review Requirements**
   - [ ] All tests passing
   - [ ] Code coverage maintained
   - [ ] No linting errors
   - [ ] Documentation updated
   - [ ] At least 1 approval

6. **Merge Strategy**
   - Use "Squash and merge" for feature branches
   - Use "Merge commit" for release branches

### Pre-commit Hooks

Setup Husky for automated quality checks:

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write",
      "git add"
    ],
    "*.{json,md}": [
      "prettier --write",
      "git add"
    ]
  }
}
```

## Coding Standards

### TypeScript Guidelines

1. **Strict Type Safety**
   ```typescript
   // ✅ Good: Explicit types
   interface UserCreateRequest {
     email: string;
     password: string;
     firstName: string;
     lastName: string;
   }

   // ❌ Bad: Any types
   function createUser(data: any): any {
     // ...
   }
   ```

2. **Consistent Naming**
   ```typescript
   // ✅ PascalCase for classes, interfaces, types
   class VideoService {}
   interface ProcessingJob {}
   type LicenseType = 'FREE' | 'PREMIUM';

   // ✅ camelCase for variables, functions
   const videoProcessor = new VideoProcessor();
   const processVideo = async () => {};

   // ✅ SCREAMING_SNAKE_CASE for constants
   const MAX_FILE_SIZE = 500 * 1024 * 1024;
   ```

3. **Function Organization**
   ```typescript
   // ✅ Good: Small, focused functions
   export class AuthController {
     async register(req: Request, res: Response): Promise<void> {
       try {
         const userData = this.validateRegistrationData(req.body);
         const user = await this.userService.createUser(userData);
         const token = this.generateToken(user);

         ResponseHelper.success(res, { user, token }, 'Registration successful', 201);
       } catch (error) {
         this.handleError(error, res);
       }
     }

     private validateRegistrationData(data: any): UserCreateRequest {
       // Validation logic
     }

     private generateToken(user: User): string {
       // Token generation logic
     }
   }
   ```

### Code Organization

#### File Structure Standards

```
src/
├── controllers/           # HTTP request handlers
│   ├── auth.controller.ts
│   └── user.controller.ts
├── services/             # Business logic
│   ├── auth.service.ts
│   └── video.service.ts
├── middleware/           # Express middleware
│   ├── auth.middleware.ts
│   └── validation.middleware.ts
├── routes/              # Route definitions
│   ├── auth.routes.ts
│   └── user.routes.ts
├── utils/               # Utility functions
│   ├── logger.ts
│   └── response.ts
├── types/               # TypeScript type definitions
│   └── index.ts
└── workers/             # Background job processors
    └── video-processing.worker.ts
```

#### Import Organization

```typescript
// ✅ Good: Organized imports
// 1. Node modules
import express from 'express';
import bcrypt from 'bcryptjs';

// 2. Internal modules (absolute paths)
import { UserService } from '@/services/user.service';
import { ResponseHelper } from '@/utils/response';
import { AuthTokenPayload } from '@/types';

// 3. Relative imports
import { validatePassword } from './auth.utils';
```

### Error Handling

#### Consistent Error Patterns

```typescript
// ✅ Good: Structured error handling
export class VideoProcessingError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'VideoProcessingError';
  }
}

// Usage
try {
  await processVideo(videoPath);
} catch (error) {
  if (error instanceof VideoProcessingError) {
    logger.error('Video processing failed:', {
      code: error.code,
      details: error.details,
      message: error.message
    });
  } else {
    logger.error('Unexpected error:', error);
  }
  throw error;
}
```

#### API Error Responses

```typescript
// ✅ Consistent error response format
export class ResponseHelper {
  static error(
    res: Response,
    error: string,
    statusCode: number = 400,
    details?: any
  ): Response<ApiResponse> {
    logger.error('API Error Response', {
      error,
      statusCode,
      details,
      timestamp: new Date().toISOString()
    });

    return res.status(statusCode).json({
      success: false,
      error,
      ...(details && { details })
    });
  }
}
```

### Database Patterns

#### Prisma Best Practices

```typescript
// ✅ Good: Transaction usage
export class UserService {
  async purchaseCredits(userId: string, amount: number): Promise<CreditTransaction> {
    return prisma.$transaction(async (tx) => {
      // Update user credits
      await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: amount } }
      });

      // Record transaction
      return tx.creditTransaction.create({
        data: {
          userId,
          amount,
          type: TransactionType.PURCHASE,
          description: `Credit purchase: ${amount} credits`
        }
      });
    });
  }

  // ✅ Good: Selective field queries
  async getUserProfile(userId: string): Promise<UserProfile> {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        credits: true,
        licenseType: true,
        licenseExpiry: true
      }
    });
  }
}
```

## Testing Standards

### Test Organization

```
tests/
├── unit/                 # Unit tests
│   ├── services/
│   ├── controllers/
│   └── utils/
├── integration/          # Integration tests
│   ├── auth.integration.test.ts
│   └── api.integration.test.ts
└── setup.ts             # Test configuration
```

### Testing Patterns

#### Unit Test Structure

```typescript
// ✅ Good: Comprehensive unit test
describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    mockPrisma = mockDeep<PrismaClient>();
    authService = new AuthService(mockPrisma);
  });

  describe('registerUser', () => {
    const validUserData = {
      email: 'test@example.com',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe'
    };

    it('should create user with hashed password', async () => {
      // Arrange
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      // Act
      const result = await authService.registerUser(validUserData);

      // Assert
      expect(result).toMatchObject({
        id: expect.any(String),
        email: validUserData.email
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: validUserData.email,
          password: expect.not.stringMatching(validUserData.password) // Hashed
        })
      });
    });

    it('should throw error for duplicate email', async () => {
      // Arrange
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(authService.registerUser(validUserData))
        .rejects.toThrow('Email already registered');
    });
  });
});
```

#### Integration Test Patterns

```typescript
// ✅ Good: API integration test
describe('POST /api/v1/auth/register', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany(); // Clean slate
  });

  it('should register new user successfully', async () => {
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
      data: {
        user: {
          email: userData.email,
          firstName: userData.firstName
        },
        token: expect.any(String)
      }
    });

    // Verify in database
    const user = await prisma.user.findUnique({
      where: { email: userData.email }
    });
    expect(user).toBeTruthy();
  });
});
```

### Test Coverage Requirements

- **Minimum 80% overall coverage**
- **100% coverage for critical paths** (auth, payments, video processing)
- **Unit tests for all services and utilities**
- **Integration tests for all API endpoints**
- **E2E tests for main user flows**

## Code Review Checklist

### Code Quality

- [ ] **Functionality**: Code works as intended
- [ ] **Logic**: Business logic is correct and handles edge cases
- [ ] **Performance**: No obvious performance issues
- [ ] **Security**: No security vulnerabilities
- [ ] **Error Handling**: Proper error handling and logging

### Code Style

- [ ] **TypeScript**: Proper typing, no `any` types
- [ ] **Naming**: Clear, descriptive naming conventions
- [ ] **Structure**: Code is well-organized and follows patterns
- [ ] **Comments**: Complex logic is documented
- [ ] **Consistency**: Follows project coding standards

### Testing

- [ ] **Test Coverage**: New code has appropriate tests
- [ ] **Test Quality**: Tests are meaningful and comprehensive
- [ ] **Test Execution**: All tests pass
- [ ] **Edge Cases**: Important edge cases are tested

### Documentation

- [ ] **API Docs**: New endpoints documented
- [ ] **Code Comments**: Complex logic explained
- [ ] **README**: Updated if necessary
- [ ] **Migration Docs**: Database changes documented

## Performance Guidelines

### Database Optimization

```typescript
// ✅ Good: Optimized queries
async getProjectsWithCounts(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          videoFiles: true,
          processingJobs: true
        }
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: 20
  });
}

// ❌ Bad: N+1 queries
async getProjectsWithVideoCount(userId: string) {
  const projects = await prisma.project.findMany({ where: { userId } });

  for (const project of projects) {
    project.videoCount = await prisma.videoFile.count({
      where: { projectId: project.id }
    });
  }

  return projects;
}
```

### API Response Optimization

```typescript
// ✅ Good: Pagination and selective fields
export const PaginationSchema = z.object({
  page: z.string().transform(val => Math.max(1, parseInt(val) || 1)),
  limit: z.string().transform(val => Math.min(100, Math.max(1, parseInt(val) || 10)))
});

async getProjects(req: AuthenticatedRequest, res: Response) {
  const { page, limit } = req.query as any;
  const skip = (page - 1) * limit;

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where: { userId: req.user.userId },
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.project.count({ where: { userId: req.user.userId } })
  ]);

  const pagination = createPagination(page, limit, total);
  ResponseHelper.success(res, projects, 'Projects retrieved', 200, pagination);
}
```

## Security Guidelines

### Input Validation

```typescript
// ✅ Good: Comprehensive validation
export const ProjectCreateSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s-_]+$/, 'Name contains invalid characters'),

  description: z.string()
    .max(500, 'Description must not exceed 500 characters')
    .optional(),

  settings: z.object({
    mixingMode: z.nativeEnum(MixingMode),
    outputFormat: z.nativeEnum(VideoFormat),
    quality: z.nativeEnum(VideoQuality),
    outputCount: z.number()
      .min(1, 'Must generate at least 1 output')
      .max(1000, 'Cannot generate more than 1000 outputs')
  })
});
```

### Authentication Security

```typescript
// ✅ Good: Secure token handling
export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return ResponseHelper.unauthorized(res, 'Access token required');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthTokenPayload;

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, isActive: true, licenseExpiry: true }
    });

    if (!user?.isActive) {
      return ResponseHelper.unauthorized(res, 'Invalid or inactive user');
    }

    if (user.licenseExpiry && user.licenseExpiry < new Date()) {
      return ResponseHelper.unauthorized(res, 'License expired');
    }

    req.user = decoded;
    next();
  } catch (error) {
    return ResponseHelper.unauthorized(res, 'Invalid token');
  }
};
```

## Documentation Standards

### Code Documentation

```typescript
/**
 * Processes video mixing job with specified settings
 *
 * @param jobId - Unique identifier for the processing job
 * @param data - Job configuration including project ID and settings
 * @throws {VideoProcessingError} When video processing fails
 * @throws {InsufficientCreditsError} When user has insufficient credits
 *
 * @example
 * ```typescript
 * await videoProcessor.processJob('job_123', {
 *   projectId: 'proj_456',
 *   outputCount: 5,
 *   settings: { quality: 'HIGH', format: 'MP4' }
 * });
 * ```
 */
async processVideo(jobId: string, data: ProcessingJobData): Promise<void> {
  // Implementation
}
```

### API Documentation

- **Use OpenAPI/Swagger** for API documentation
- **Include request/response examples** for all endpoints
- **Document error scenarios** and status codes
- **Provide SDK examples** in multiple languages

This development workflow ensures code quality, team collaboration, and project maintainability while following industry best practices.