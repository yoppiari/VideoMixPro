# Database Documentation

## Overview

Video Mixer Pro uses **PostgreSQL** as the primary database with **Prisma ORM** for type-safe database access. The database is designed to handle user management, project organization, video file tracking, and asynchronous job processing.

## Database Schema

### Entity Relationship Diagram (ERD)

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      Users      │       │    Projects     │       │   VideoGroups   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │────┐  │ id (PK)         │────┐  │ id (PK)         │
│ email (unique)  │    │  │ name            │    │  │ name            │
│ password        │    │  │ description     │    │  │ order           │
│ firstName       │    │  │ userId (FK)     │    │  │ projectId (FK)  │
│ lastName        │    │  │ status          │    │  │ createdAt       │
│ isActive        │    │  │ outputCount     │    │  └─────────────────┘
│ credits         │    │  │ settings (JSON) │    │           │
│ licenseType     │    │  │ createdAt       │    │           │
│ licenseExpiry   │    │  │ updatedAt       │    │           │
│ createdAt       │    │  └─────────────────┘    │           │
│ updatedAt       │    │           │              │           │
└─────────────────┘    │           │              │           │
         │              │           │              │           │
         │              └───────────┼──────────────┘           │
         │                          │                          │
         │              ┌─────────────────┐                    │
         │              │   VideoFiles    │                    │
         │              ├─────────────────┤                    │
         │              │ id (PK)         │                    │
         │              │ originalName    │                    │
         │              │ filename        │                    │
         │              │ path            │                    │
         │              │ size            │                    │
         │              │ duration        │                    │
         │              │ format          │                    │
         │              │ resolution      │                    │
         │              │ projectId (FK)  │────────────────────┘
         │              │ groupId (FK)    │────────────────────┐
         │              │ uploadedAt      │                    │
         │              └─────────────────┘                    │
         │                       │                             │
         │                       │                             │
         │              ┌─────────────────┐                    │
         │              │ ProcessingJobs  │                    │
         │              ├─────────────────┤                    │
         │              │ id (PK)         │                    │
         │              │ projectId (FK)  │────────────────────┘
         │              │ status          │
         │              │ progress        │
         │              │ startedAt       │
         │              │ completedAt     │
         │              │ errorMessage    │
         │              │ createdAt       │
         │              └─────────────────┘
         │                       │
         │                       │
         │                       │
         │              ┌─────────────────┐
         │              │   OutputFiles   │
         │              ├─────────────────┤
         │              │ id (PK)         │
         │              │ jobId (FK)      │────────────────────┘
         │              │ filename        │
         │              │ path            │
         │              │ size            │
         │              │ duration        │
         │              │ metadata (JSON) │
         │              │ sourceFiles     │
         │              │ createdAt       │
         │              └─────────────────┘
         │
         │
┌─────────────────┐
│CreditTransactions│
├─────────────────┤
│ id (PK)         │
│ userId (FK)     │──────────────────────┘
│ amount          │
│ type            │
│ description     │
│ createdAt       │
└─────────────────┘
```

## Table Specifications

### Users Table
Stores user account information and license details.

```sql
CREATE TABLE users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password        TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    credits         INTEGER DEFAULT 0,
    license_type    TEXT DEFAULT 'FREE',
    license_expiry  TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE UNIQUE INDEX users_email_idx ON users(email);
CREATE INDEX users_license_type_idx ON users(license_type);
CREATE INDEX users_created_at_idx ON users(created_at);
```

**Constraints:**
- `email`: Must be valid email format, unique across system
- `password`: BCrypt hashed, minimum 8 characters original
- `license_type`: Enum('FREE', 'PREMIUM', 'ENTERPRISE')
- `credits`: Non-negative integer

### Projects Table
Stores video mixing project information and settings.

```sql
CREATE TABLE projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT DEFAULT 'DRAFT',
    output_count  INTEGER DEFAULT 0,
    settings      JSONB NOT NULL,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX projects_user_id_idx ON projects(user_id);
CREATE INDEX projects_status_idx ON projects(status);
CREATE INDEX projects_created_at_idx ON projects(created_at);
CREATE INDEX projects_settings_gin_idx ON projects USING GIN(settings);
```

**Constraints:**
- `status`: Enum('DRAFT', 'PROCESSING', 'COMPLETED', 'FAILED')
- `settings`: JSON object containing mixing configuration
- `output_count`: Non-negative integer

**Settings JSON Schema:**
```json
{
  "mixingMode": "AUTO" | "MANUAL",
  "outputFormat": "MP4" | "MOV" | "AVI",
  "quality": "LOW" | "MEDIUM" | "HIGH" | "ULTRA",
  "outputCount": number,
  "metadata": {
    "static": { [key: string]: string },
    "includeDynamic": boolean,
    "fields": string[]
  },
  "groups"?: Array<{
    "name": string,
    "order": number
  }>
}
```

### Video Groups Table
Organizes videos within projects for manual mixing mode.

```sql
CREATE TABLE video_groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    order_num   INTEGER NOT NULL,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX video_groups_project_id_idx ON video_groups(project_id);
CREATE INDEX video_groups_order_idx ON video_groups(project_id, order_num);
```

**Constraints:**
- `order_num`: Non-negative integer, unique within project
- `name`: Required, non-empty string

### Video Files Table
Tracks uploaded video files and their metadata.

```sql
CREATE TABLE video_files (
    id            TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    filename      TEXT NOT NULL,
    path          TEXT NOT NULL,
    size          INTEGER NOT NULL,
    duration      DECIMAL NOT NULL,
    format        TEXT NOT NULL,
    resolution    TEXT NOT NULL,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    group_id      TEXT REFERENCES video_groups(id) ON DELETE SET NULL,
    uploaded_at   TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX video_files_project_id_idx ON video_files(project_id);
CREATE INDEX video_files_group_id_idx ON video_files(group_id);
CREATE INDEX video_files_uploaded_at_idx ON video_files(uploaded_at);
CREATE INDEX video_files_format_idx ON video_files(format);
```

**Constraints:**
- `size`: File size in bytes, positive integer
- `duration`: Video duration in seconds, positive decimal
- `resolution`: Format "WIDTHxHEIGHT" (e.g., "1920x1080")
- `path`: Absolute file system path

### Processing Jobs Table
Tracks asynchronous video processing jobs.

```sql
CREATE TABLE processing_jobs (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status         TEXT DEFAULT 'PENDING',
    progress       INTEGER DEFAULT 0,
    started_at     TIMESTAMP,
    completed_at   TIMESTAMP,
    error_message  TEXT,
    created_at     TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX processing_jobs_project_id_idx ON processing_jobs(project_id);
CREATE INDEX processing_jobs_status_idx ON processing_jobs(status);
CREATE INDEX processing_jobs_created_at_idx ON processing_jobs(created_at);
```

**Constraints:**
- `status`: Enum('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')
- `progress`: Integer 0-100
- `started_at`: Set when processing begins
- `completed_at`: Set when processing ends (success or failure)

### Output Files Table
Stores information about generated video files.

```sql
CREATE TABLE output_files (
    id           TEXT PRIMARY KEY,
    job_id       TEXT NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    path         TEXT NOT NULL,
    size         INTEGER NOT NULL,
    duration     DECIMAL NOT NULL,
    metadata     JSONB NOT NULL,
    source_files JSONB NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX output_files_job_id_idx ON output_files(job_id);
CREATE INDEX output_files_created_at_idx ON output_files(created_at);
CREATE INDEX output_files_metadata_gin_idx ON output_files USING GIN(metadata);
```

**Constraints:**
- `metadata`: JSON object with embedded video metadata
- `source_files`: JSON array of source video file IDs
- `size`: File size in bytes
- `duration`: Video duration in seconds

### Credit Transactions Table
Tracks user credit purchases and usage.

```sql
CREATE TABLE credit_transactions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      INTEGER NOT NULL,
    type        TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX credit_transactions_user_id_idx ON credit_transactions(user_id);
CREATE INDEX credit_transactions_type_idx ON credit_transactions(type);
CREATE INDEX credit_transactions_created_at_idx ON credit_transactions(created_at);
```

**Constraints:**
- `amount`: Can be negative (usage) or positive (purchase/refund)
- `type`: Enum('PURCHASE', 'USAGE', 'REFUND')
- `description`: Human-readable transaction description

## Database Migrations

### Migration Strategy
Prisma handles migrations automatically with version control.

```bash
# Generate migration
npx prisma migrate dev --name migration_name

# Apply migrations to production
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

### Migration Files Location
```
prisma/
├── migrations/
│   ├── 20240101000000_init/
│   │   └── migration.sql
│   ├── 20240115000000_add_video_groups/
│   │   └── migration.sql
│   └── migration_lock.toml
└── schema.prisma
```

## Data Seeding

### Development Seed Data

Create seed script at `prisma/seed.ts`:

```typescript
import { PrismaClient, LicenseType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create test users
  const hashedPassword = await bcrypt.hash('password123', 12);

  const testUser = await prisma.user.create({
    data: {
      email: 'test@videomixpro.com',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      credits: 1000,
      licenseType: LicenseType.PREMIUM,
      licenseExpiry: new Date('2025-12-31')
    }
  });

  // Create sample project
  const project = await prisma.project.create({
    data: {
      name: 'Sample Marketing Campaign',
      description: 'Demo project for testing',
      userId: testUser.id,
      settings: {
        mixingMode: 'AUTO',
        outputFormat: 'MP4',
        quality: 'HIGH',
        outputCount: 5,
        metadata: {
          static: { campaign: 'demo' },
          includeDynamic: true
        }
      }
    }
  });

  console.log({ testUser, project });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run seeding:
```bash
npx prisma db seed
```

## Database Optimization

### Performance Indexes

**High Priority Indexes:**
```sql
-- User lookups by email (authentication)
CREATE UNIQUE INDEX users_email_idx ON users(email);

-- Project listings by user
CREATE INDEX projects_user_id_created_at_idx ON projects(user_id, created_at DESC);

-- Video files by project
CREATE INDEX video_files_project_id_uploaded_at_idx ON video_files(project_id, uploaded_at DESC);

-- Active processing jobs
CREATE INDEX processing_jobs_status_created_at_idx ON processing_jobs(status, created_at)
WHERE status IN ('PENDING', 'PROCESSING');

-- Recent transactions by user
CREATE INDEX credit_transactions_user_id_created_at_idx ON credit_transactions(user_id, created_at DESC);
```

**JSON Field Optimization:**
```sql
-- Project settings search
CREATE INDEX projects_mixing_mode_idx ON projects USING GIN((settings->>'mixingMode'));

-- Output file metadata search
CREATE INDEX output_files_metadata_campaign_idx ON output_files USING GIN((metadata->>'campaign'));
```

### Query Optimization Tips

1. **Use SELECT specific fields** instead of SELECT *
2. **Implement pagination** for large result sets
3. **Use database-level filtering** instead of application filtering
4. **Leverage Prisma's include/select** for nested data
5. **Monitor slow queries** with PostgreSQL logs

### Connection Pooling

Configure Prisma connection pooling:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/videomixpro?schema=public&connection_limit=20&pool_timeout=20"
```

## Backup Strategy

### Production Backup Plan

1. **Daily automated backups** via pg_dump
2. **Point-in-time recovery** enabled
3. **Cross-region backup storage**
4. **Regular restore testing**

```bash
# Daily backup script
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restore from backup
psql $DATABASE_URL < backup_20240115.sql
```

### File Storage Backup

Video files require separate backup strategy:
- **AWS S3 versioning** for file history
- **Cross-region replication** for disaster recovery
- **Lifecycle policies** for cost optimization

## Database Monitoring

### Key Metrics to Monitor

1. **Connection count** and pool utilization
2. **Query performance** and slow query log
3. **Database size** growth trends
4. **Index usage** statistics
5. **Lock conflicts** and deadlocks

### Monitoring Setup

```sql
-- Enable slow query logging
SET log_min_duration_statement = 1000; -- Log queries > 1 second

-- Monitor connection usage
SELECT count(*) FROM pg_stat_activity;

-- Check index usage
SELECT schemaname,tablename,attname,n_distinct,correlation
FROM pg_stats WHERE tablename = 'users';
```

## Security Considerations

### Database Security

1. **Row Level Security (RLS)** for multi-tenant isolation
2. **Encrypted connections** (SSL/TLS)
3. **Limited database user permissions**
4. **Regular security updates**
5. **Audit logging** for sensitive operations

### Example RLS Policy

```sql
-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Users can only see their own projects
CREATE POLICY user_projects ON projects
    FOR ALL TO authenticated_user
    USING (user_id = current_user_id());
```

## Development Best Practices

### Prisma Best Practices

1. **Use transactions** for multi-table operations
2. **Validate input** before database operations
3. **Handle unique constraint violations** gracefully
4. **Use proper TypeScript types** from Prisma
5. **Test database operations** with integration tests

### Example Transaction

```typescript
const result = await prisma.$transaction(async (tx) => {
  // Deduct credits
  await tx.user.update({
    where: { id: userId },
    data: { credits: { decrement: creditsRequired } }
  });

  // Create transaction record
  const transaction = await tx.creditTransaction.create({
    data: {
      userId,
      amount: -creditsRequired,
      type: 'USAGE',
      description: 'Video processing'
    }
  });

  return transaction;
});
```

This database design supports all features of Video Mixer Pro while maintaining performance, scalability, and data integrity.