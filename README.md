# Video Mixer Pro

A SaaS platform for automated video mixing and A/B testing, enabling users to create hundreds of video variations quickly and efficiently.

## Features

- **User Management**: Registration, authentication, and license management
- **Project Management**: Create and manage video mixing projects
- **Video Upload**: Support for multiple video formats with metadata extraction
- **Auto Mixing**: Randomly combine videos for quick variations
- **Manual Mixing**: Group-based video sequencing with custom ordering
- **Metadata Embedding**: Static and dynamic metadata insertion
- **Credit System**: Purchase and track credits for cloud processing
- **Background Processing**: Asynchronous video processing with progress tracking
- **API-First Design**: RESTful API with comprehensive documentation

## Technology Stack

### Core Technologies
- **Backend**: Node.js + TypeScript + Express.js
- **Video Processing**: FFmpeg with fluent-ffmpeg
- **Authentication**: JWT tokens
- **Testing**: Jest with unit and integration tests
- **Code Quality**: ESLint + TypeScript

### Environment-Adaptive Architecture

| Component | Development | Production |
|-----------|------------|------------|
| **Database** | SQLite (file-based) | PostgreSQL |
| **Queue System** | In-memory queue | Redis + Bull Queue |
| **File Storage** | Local filesystem | AWS S3 / Cloud Storage |
| **ORM** | Prisma (SQLite provider) | Prisma (PostgreSQL provider) |
| **Resource Usage** | < 500MB RAM | Scalable |

## Prerequisites

### For Development (Minimal Requirements)
- Node.js 16+ (that's it!)
- FFmpeg (optional, will be downloaded automatically)

### For Production
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- FFmpeg 4.4+

## Installation

### Quick Start (Development - No Docker/Database Installation Required!)

```bash
# 1. Clone the repository
git clone <repository-url>
cd VideoMixPro

# 2. Run automated setup (installs everything)
npm run setup:dev

# 3. Start backend servers
npm run dev           # Terminal 1: API server (port 3000)
npm run queue:dev     # Terminal 2: Worker processes

# 4. Start frontend (in new terminal)
cd frontend
npm install          # First time only
npm start           # Runs on port 3001

# Done!
# Backend API: http://localhost:3000
# Frontend UI: http://localhost:3001
```

### Manual Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd VideoMixPro
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   # For development (SQLite + in-memory queue)
   cp .env.development .env

   # For production (PostgreSQL + Redis)
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Database setup**
   ```bash
   npm run db:migrate
   npm run db:generate
   ```

5. **Start development servers**
   ```bash
   # Terminal 1: API Server
   npm run dev

   # Terminal 2: Background Workers
   npm run queue:dev
   ```

## Environment Variables

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/videomixpro"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="24h"

# FFmpeg Paths
FFMPEG_PATH="/usr/bin/ffmpeg"
FFPROBE_PATH="/usr/bin/ffprobe"

# File Upload
MAX_FILE_SIZE=500MB
UPLOAD_PATH="uploads"
OUTPUT_DIR="outputs"
```

## API Documentation

### Authentication

#### Register User
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Projects

#### Create Project
```http
POST /api/v1/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Marketing Campaign A",
  "description": "Product demo variations",
  "settings": {
    "mixingMode": "AUTO",
    "outputFormat": "MP4",
    "quality": "HIGH",
    "outputCount": 10,
    "metadata": {
      "static": {
        "campaign": "summer-2024"
      },
      "includeDynamic": true
    }
  }
}
```

### Video Upload

#### Upload Videos
```http
POST /api/v1/videos/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

videos: [file1.mp4, file2.mp4, ...]
projectId: "project-uuid"
groupId: "group-uuid" (optional)
```

### Processing

#### Start Processing
```http
POST /api/v1/processing/start/:projectId
Authorization: Bearer <token>
```

#### Get Job Status
```http
GET /api/v1/processing/status/:jobId
Authorization: Bearer <token>
```

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run queue:dev        # Start background workers

# Building
npm run build           # Compile TypeScript
npm run start          # Start production server

# Testing
npm run test           # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Generate coverage report

# Code Quality
npm run lint           # Run ESLint
npm run lint:fix       # Fix ESLint errors
npm run typecheck      # Run TypeScript compiler check

# Database
npm run db:migrate     # Run database migrations
npm run db:generate    # Generate Prisma client
npm run db:studio      # Open Prisma Studio
```

### Project Structure

```
src/
├── controllers/       # Route handlers
├── services/         # Business logic
├── middleware/       # Express middleware
├── routes/          # API route definitions
├── utils/           # Utility functions
├── workers/         # Background job processors
├── types/           # TypeScript type definitions
└── index.ts         # Application entry point

tests/
├── unit/           # Unit tests
├── integration/    # Integration tests
└── setup.ts        # Test configuration

prisma/
├── schema.prisma   # Database schema
└── migrations/     # Database migrations
```

### Architecture Principles

1. **Separation of Concerns**: Clear separation between controllers, services, and data access
2. **API-First Design**: All functionality exposed through RESTful APIs
3. **Modular Structure**: Independent, reusable modules
4. **Type Safety**: Full TypeScript coverage with strict checking
5. **Error Handling**: Comprehensive error handling and logging
6. **Testing**: Unit and integration tests for all critical paths

## Production Deployment

### Docker Setup

```dockerfile
# Dockerfile example
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Checklist

- [ ] Database connection configured
- [ ] Redis connection configured
- [ ] JWT secrets set
- [ ] FFmpeg installed and paths configured
- [ ] File storage configured (S3 or local)
- [ ] Logging configured
- [ ] Process manager (PM2) configured
- [ ] Health checks enabled
- [ ] Monitoring (optional)

## Performance Considerations

- **Video Processing**: CPU-intensive operations run in background workers
- **File Storage**: Large video files stored outside database
- **Caching**: Redis used for session storage and job queues
- **Database**: Proper indexing on frequently queried fields
- **API Rate Limiting**: Implement rate limiting for production use

## Security

- **Authentication**: JWT-based stateless authentication
- **Authorization**: Role-based access control
- **Input Validation**: Comprehensive request validation
- **File Upload**: File type and size validation
- **SQL Injection**: Prisma ORM provides protection
- **CORS**: Configured for specific origins
- **Headers**: Security headers via Helmet.js

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This project is proprietary software. All rights reserved.

## Support

For support and questions:
- Create an issue in the repository
- Contact: support@videomixpro.com