# VideoMixPro Production Deployment Guide

**Last Updated**: 2025-10-04
**Target Platform**: Coolify (Docker)
**Database**: PostgreSQL (External)
**Domain**: https://private.lumiku.com

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [Deployment Process](#deployment-process)
7. [Troubleshooting](#troubleshooting)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Rollback Procedures](#rollback-procedures)

---

## 🎯 System Overview

VideoMixPro is deployed as a unified Docker container that includes:
- **Frontend**: React SPA served by Nginx on port 3000
- **Backend**: Node.js/Express API on port 3002
- **Database**: External PostgreSQL (not in container)
- **Process Manager**: Supervisord
- **Reverse Proxy**: Traefik (via Coolify)

### Key Components

```
┌─────────────────────────────────────────┐
│         Traefik (Coolify)              │
│       https://private.lumiku.com       │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Docker Container               │
│  ┌────────────────────────────────┐   │
│  │   Nginx :3000 (Frontend)       │   │
│  │   ├─ /api/* → Backend          │   │
│  │   ├─ /health → Backend         │   │
│  │   └─ /* → React SPA            │   │
│  └────────────────────────────────┘   │
│  ┌────────────────────────────────┐   │
│  │   Node.js :3002 (Backend)      │   │
│  │   ├─ Express API               │   │
│  │   ├─ Prisma ORM                │   │
│  │   └─ FFmpeg Processing         │   │
│  └────────────────────────────────┘   │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   PostgreSQL External Database         │
│   107.155.75.50:5986/videomix         │
└────────────────────────────────────────┘
```

---

## ✅ Prerequisites

### Required Services
- ✅ Coolify instance running (cf.avolut.com)
- ✅ PostgreSQL database accessible from Coolify server
- ✅ GitHub repository access (yoppiari/VideoMixPro)
- ✅ Domain configured (private.lumiku.com)

### Required Tools (Local Development)
- Node.js 18+
- npm/yarn
- Git
- PostgreSQL client (for testing)

### Coolify Configuration
- **App UUID**: `osgk488wo0w0kgck84cwk40k`
- **API Token**: `5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97`
- **Coolify API**: `https://cf.avolut.com/api/v1`

---

## 🏗️ Architecture

### Multi-Stage Docker Build

```dockerfile
Stage 1: Frontend Builder (node:18-alpine)
  ↓ Build React app → /app/frontend/build

Stage 2: Backend Builder (node:18-alpine)
  ↓ Build TypeScript → /app/dist
  ↓ Generate Prisma Client

Stage 3: Production Runtime (node:18-alpine)
  ↓ Install: nginx, ffmpeg, supervisor
  ↓ Copy: frontend build, backend dist
  ↓ Configure: nginx, supervisor
  ↓ Start: init-db.sh → supervisord
```

### Process Management (Supervisord)

```ini
[program:backend]
  Command: node dist/index.js
  Port: 3002
  Auto-restart: true

[program:nginx]
  Command: nginx -g "daemon off;"
  Port: 3000
  Depends: backend
  Auto-restart: true
```

---

## ⚙️ Environment Configuration

### Critical Environment Variables

Set these in Coolify → App Settings → Environment:

```bash
# Database (CRITICAL - MUST BE SET)
DATABASE_URL=postgres://postgres:6LP0Ojegy7IUU6kaX9lLkmZRUiAdAUNOltWyL3LegfYGR6rPQtB4DUSVqjdA78ES@107.155.75.50:5986/videomix
DATABASE_PROVIDER=postgresql

# Application
NODE_ENV=production
PORT=3002
FRONTEND_URL=https://private.lumiku.com

# Security (GENERATE NEW SECRET!)
JWT_SECRET=<REPLACE-WITH-STRONG-SECRET-MIN-32-CHARS>
# Generate: openssl rand -base64 32

# Optional (with defaults)
LOG_LEVEL=info
MAX_FILE_SIZE=524288000
UPLOAD_DIR=/app/uploads
OUTPUT_DIR=/app/outputs
```

### Environment Variable Priority

1. **Coolify Environment Tab** (highest priority)
2. Dockerfile ENV statements
3. .env file (not used in production)

⚠️ **NEVER commit production secrets to repository!**

---

## 💾 Database Setup

### Database Connection Details

```bash
Host: 107.155.75.50
Port: 5986
Database: videomix
User: postgres
Password: 6LP0Ojegy7IUU6kaX9lLkmZRUiAdAUNOltWyL3LegfYGR6rPQtB4DUSVqjdA78ES
```

### Connection String Format

```
postgresql://[user]:[password]@[host]:[port]/[database]?schema=public
```

### Pre-Deployment Database Check

```bash
# Test connection from Coolify server
psql "postgres://postgres:6LP0Ojegy7IUU6kaX9lLkmZRUiAdAUNOltWyL3LegfYGR6rPQtB4DUSVqjdA78ES@107.155.75.50:5986/videomix" -c "SELECT version();"

# Should return PostgreSQL version
```

### Database Initialization Flow

The `init-db.sh` script in container handles:

1. ✅ Force PostgreSQL provider in Docker
2. ✅ Generate PostgreSQL schema
3. ✅ Wait for database connectivity (max 5 minutes)
4. ✅ Activate PostgreSQL migrations from `migrations-postgres/`
5. ✅ Run `prisma migrate deploy`
6. ✅ Create admin user with default credentials
7. ✅ Generate Prisma client for runtime

### Default Admin Account

```
Email: admin@videomix.pro
Password: Admin123!
Credits: 1000
Role: ADMIN
License: ENTERPRISE
```

⚠️ **Change password after first login!**

---

## 🚀 Deployment Process

### PHASE 1: Prepare Repository

#### Step 1.1: Generate PostgreSQL Migrations

```bash
# Navigate to project directory
cd /path/to/VideoMixPro

# Switch to PostgreSQL configuration
cp .env.postgres .env

# Generate schema for PostgreSQL
npm run db:generate-schema

# Generate migrations
npx prisma migrate dev --name init_postgresql --create-only

# Create dedicated PostgreSQL migrations folder
mkdir -p prisma/migrations-postgres
cp -r prisma/migrations/* prisma/migrations-postgres/

# Update migration lock file
echo '# Please do not edit this file manually
# It should be added in your version-control system (i.e. Git)
provider = "postgresql"' > prisma/migrations-postgres/migration_lock.toml

# Restore SQLite for local development
git checkout .env
# OR
cp .env.sqlite .env
```

#### Step 1.2: Verify Migration Files

```bash
# Check migrations-postgres directory exists
ls -la prisma/migrations-postgres/

# Should contain:
# - migration_lock.toml (provider = "postgresql")
# - [timestamp]_init_postgresql/migration.sql
```

#### Step 1.3: Commit and Push

```bash
git add prisma/migrations-postgres/
git status  # Verify only migrations added

git commit -m "feat: Add PostgreSQL migrations for production deployment"
git push origin main
```

### PHASE 2: Configure Coolify

#### Step 2.1: Access Coolify API or UI

**Option A: Via UI**
1. Navigate to https://cf.avolut.com
2. Find app `vidmix` (osgk488wo0w0kgck84cwk40k)
3. Go to Environment tab

**Option B: Via API** (for automation)
```bash
# Get current env vars
curl -X GET "https://cf.avolut.com/api/v1/applications/osgk488wo0w0kgck84cwk40k" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97"
```

#### Step 2.2: Set Environment Variables

Add/Update these environment variables in Coolify:

```bash
DATABASE_URL=postgres://postgres:6LP0Ojegy7IUU6kaX9lLkmZRUiAdAUNOltWyL3LegfYGR6rPQtB4DUSVqjdA78ES@107.155.75.50:5986/videomix
DATABASE_PROVIDER=postgresql
NODE_ENV=production
PORT=3002
JWT_SECRET=<generate-strong-secret>
FRONTEND_URL=https://private.lumiku.com
LOG_LEVEL=info
```

#### Step 2.3: Verify Database Access

```bash
# From Coolify server or local machine with access
psql "postgres://postgres:6LP0Ojegy7IUU6kaX9lLkmZRUiAdAUNOltWyL3LegfYGR6rPQtB4DUSVqjdA78ES@107.155.75.50:5986/videomix" -c "\dt"

# Should list existing tables or return empty (if new database)
```

### PHASE 3: Deploy

#### Step 3.1: Trigger Deployment

**Via Coolify UI:**
1. Go to app `vidmix` → Deployments tab
2. Click "Deploy" button
3. Check "Force rebuild" to bypass cache
4. Confirm deployment

**Via API:**
```bash
curl -X GET "https://cf.avolut.com/api/v1/deploy?uuid=osgk488wo0w0kgck84cwk40k&force=true" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97" \
  -H "Accept: application/json"
```

#### Step 3.2: Monitor Build Logs

Watch for these key stages:

```
✅ Stage 1/3: Frontend build
  - npm ci --legacy-peer-deps
  - npm run build

✅ Stage 2/3: Backend build
  - npm ci
  - npx prisma generate
  - npm run build

✅ Stage 3/3: Production runtime
  - Install: ffmpeg, nginx, supervisor
  - Copy artifacts
  - Configure services
```

#### Step 3.3: Monitor Initialization

Key log messages to watch:

```bash
🚀 Starting VideoMixPro with external PostgreSQL...
🔧 Docker container configured for PostgreSQL
📝 Generating PostgreSQL schema...
🔄 Generating Prisma client...
📡 Connecting to external PostgreSQL database...
✅ External PostgreSQL is ready
🔄 Running Prisma migrations...
✅ Migrations applied successfully
👤 Creating admin user...
✅ Admin user created/updated successfully
🎉 Database initialization complete!
```

### PHASE 4: Post-Deployment Verification

#### Step 4.1: Health Check

```bash
# Wait for health check to pass (may take 60-90 seconds)
curl -f https://private.lumiku.com/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-10-04T...",
  "database": "connected",
  "uptime": 123
}
```

#### Step 4.2: Login Test

```bash
# Test admin login
curl -X POST https://private.lumiku.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@videomix.pro",
    "password": "Admin123!"
  }'

# Expected response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "...",
    "email": "admin@videomix.pro",
    "firstName": "Admin",
    "role": "ADMIN",
    "credits": 1000
  }
}
```

#### Step 4.3: Frontend Access

1. Open browser: https://private.lumiku.com
2. Should see VideoMixPro login page
3. Login with admin credentials
4. Verify dashboard loads

#### Step 4.4: Database Verification

Check database via Coolify logs:

```bash
# Get container ID
curl -X GET "https://cf.avolut.com/api/v1/applications/osgk488wo0w0kgck84cwk40k" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97" \
  | jq -r '.status'

# Or check application logs
curl -X GET "https://cf.avolut.com/api/v1/applications/osgk488wo0w0kgck84cwk40k/logs" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97"
```

---

## 🔧 Troubleshooting

### Common Issues & Solutions

#### Issue 1: Container Exits with "unhealthy" Status

**Symptoms:**
- Container status: `exited:unhealthy`
- Health check failing

**Diagnosis:**
```bash
# Check container logs
curl -X GET "https://cf.avolut.com/api/v1/applications/osgk488wo0w0kgck84cwk40k/logs" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97"
```

**Common Causes:**
1. **Database connection failed**
   - ❌ DATABASE_URL not set or incorrect
   - ❌ PostgreSQL server unreachable
   - ✅ Fix: Verify env vars, check database connectivity

2. **Migrations failed**
   - ❌ migrations-postgres/ not in repository
   - ❌ Migration lock mismatch
   - ✅ Fix: Complete PHASE 1 steps

3. **Init script timeout**
   - ❌ Database taking >5 minutes to respond
   - ✅ Fix: Check database server status

#### Issue 2: DATABASE_URL Not Found

**Error Message:**
```
❌ ERROR: DATABASE_URL environment variable is required
```

**Solution:**
1. Go to Coolify → App → Environment
2. Add `DATABASE_URL` variable
3. Redeploy with force rebuild

#### Issue 3: Migrations Not Found

**Error Message:**
```
⚠️ No migrations-postgres found, using db push instead...
```

**Impact:** Database schema created via `db push` (acceptable for first deployment)

**Proper Fix:**
1. Complete PHASE 1: Generate migrations
2. Commit and push to repository
3. Redeploy

#### Issue 4: FFmpeg Not Found (Video Processing Fails)

**Error Message:**
```
Error: FFmpeg binary not found
```

**Solution:**
- Dockerfile already installs ffmpeg via `apk add ffmpeg`
- No FFMPEG_PATH env var needed (uses system default)
- If still failing, check container has ffmpeg:
  ```bash
  docker exec <container-id> which ffmpeg
  # Should return: /usr/bin/ffmpeg
  ```

#### Issue 5: Nginx Won't Start

**Error Message:**
```
nginx: [emerg] bind() to 0.0.0.0:3000 failed (98: Address already in use)
```

**Solution:**
- Check if another process using port 3000
- Restart container
- Check supervisord logs:
  ```bash
  docker exec <container-id> cat /var/log/supervisor/nginx_stderr.log
  ```

### Emergency Fallback: Skip Migrations

If migrations repeatedly fail, use db push as fallback:

**Edit Dockerfile (line 245-266):**
```dockerfile
# FALLBACK: Use db push instead of migrations
echo "🔄 Pushing database schema (fallback mode)..."
npx prisma db push --accept-data-loss --force-reset

# Skip migration checks
# npx prisma migrate deploy  # COMMENTED OUT
```

**Redeploy with this change for quick recovery**

⚠️ **Warning**: This will reset database! Only use on empty database or as last resort.

---

## 📊 Monitoring & Maintenance

### Health Monitoring

**Endpoint**: `https://private.lumiku.com/health`

**Healthcheck Schedule:**
- Interval: 30 seconds
- Timeout: 10 seconds
- Start period: 60 seconds
- Retries: 3

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-04T10:30:00.000Z",
  "database": "connected",
  "uptime": 3600
}
```

### Log Locations (Inside Container)

```bash
# Supervisor logs
/var/log/supervisor/supervisord.log
/var/log/supervisor/backend_stdout.log
/var/log/supervisor/backend_stderr.log
/var/log/supervisor/nginx_stdout.log
/var/log/supervisor/nginx_stderr.log

# Application logs
/app/logs/

# Nginx logs
/var/log/nginx/access.log
/var/log/nginx/error.log
```

### Access Logs

```bash
# Via Coolify API
curl -X GET "https://cf.avolut.com/api/v1/applications/osgk488wo0w0kgck84cwk40k/logs" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97"

# Via Docker (if you have server access)
docker logs <container-id>
docker exec <container-id> tail -f /var/log/supervisor/backend_stderr.log
```

### Database Backups

**Recommended Schedule**: Daily at 2 AM UTC

```bash
# Backup script (run on database server or server with access)
pg_dump "postgres://postgres:PASSWORD@107.155.75.50:5986/videomix" \
  -F c \
  -f "videomix_backup_$(date +%Y%m%d_%H%M%S).dump"

# Restore if needed
pg_restore -d videomix videomix_backup_20251004_020000.dump
```

### Performance Monitoring

Key metrics to watch:
- **Container Memory**: Should stay < 2GB under normal load
- **Container CPU**: Spikes during video processing (normal)
- **Database Connections**: Monitor active connections
- **Upload Directory**: Monitor disk usage (`/app/uploads`)
- **Output Directory**: Monitor disk usage (`/app/outputs`)

### Maintenance Tasks

**Weekly:**
- Check disk usage for uploads/outputs
- Review error logs
- Verify backups

**Monthly:**
- Review user credits and transactions
- Check for failed jobs and refunds
- Update dependencies (security patches)

---

## ⏮️ Rollback Procedures

### Quick Rollback (Revert to Previous Deployment)

**Via Coolify UI:**
1. Go to Deployments tab
2. Find last successful deployment
3. Click "Redeploy" on that version

**Via API:**
```bash
# Get deployment history
curl -X GET "https://cf.avolut.com/api/v1/deployments?uuid=osgk488wo0w0kgck84cwk40k" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97"

# Deploy specific git commit
curl -X GET "https://cf.avolut.com/api/v1/deploy?uuid=osgk488wo0w0kgck84cwk40k&force=true" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97"
```

### Database Rollback

If database migrations need to be reverted:

```bash
# Connect to database
psql "postgres://postgres:PASSWORD@107.155.75.50:5986/videomix"

# Drop and recreate (DESTRUCTIVE!)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

# Restore from backup
pg_restore -d videomix videomix_backup_YYYYMMDD.dump
```

⚠️ **Always backup before destructive operations!**

---

## 📚 Reference Information

### File Structure (In Container)

```
/app/
├── dist/                 # Compiled backend
├── public/              # Frontend build
├── prisma/
│   ├── schema.prisma    # Active schema
│   ├── migrations/      # Active migrations
│   └── migrations-postgres/  # PostgreSQL migrations (copied at init)
├── scripts/             # Utility scripts
├── uploads/             # User uploads
├── outputs/             # Processed videos
├── logs/                # Application logs
└── node_modules/        # Dependencies

/etc/nginx/nginx.conf    # Nginx configuration
/etc/supervisor/conf.d/  # Supervisor configuration
```

### Port Mapping

```
Container → Host
3000 → 3000 (Nginx, publicly exposed)
3002 → internal (Backend, not exposed)
```

### Useful Commands

```bash
# Check app status
curl -X GET "https://cf.avolut.com/api/v1/applications/osgk488wo0w0kgck84cwk40k" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97"

# Trigger deployment
curl -X GET "https://cf.avolut.com/api/v1/deploy?uuid=osgk488wo0w0kgck84cwk40k&force=true" \
  -H "Authorization: Bearer 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97"

# Test health
curl https://private.lumiku.com/health

# Test login
curl -X POST https://private.lumiku.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@videomix.pro","password":"Admin123!"}'
```

### Important URLs

- **Application**: https://private.lumiku.com
- **Coolify Dashboard**: https://cf.avolut.com
- **GitHub Repository**: https://github.com/yoppiari/VideoMixPro
- **Health Check**: https://private.lumiku.com/health
- **API Base**: https://private.lumiku.com/api/v1

---

## 🆘 Emergency Contacts & Resources

### When Claude Has Errors

**This document is the primary reference**. Key sections:
- Start with [Deployment Process](#deployment-process)
- Check [Troubleshooting](#troubleshooting) for common issues
- Review [Environment Configuration](#environment-configuration) for required vars

### Critical Information Quick Reference

```bash
# Coolify
API: https://cf.avolut.com/api/v1
App UUID: osgk488wo0w0kgck84cwk40k
Token: 5|CJbL8liBi6ra65UfLhGlru4YexDVur9U86E9ZxYGc478ab97

# Database
Host: 107.155.75.50:5986
Database: videomix
User: postgres
Password: 6LP0Ojegy7IUU6kaX9lLkmZRUiAdAUNOltWyL3LegfYGR6rPQtB4DUSVqjdA78ES

# Default Admin
Email: admin@videomix.pro
Password: Admin123!

# Domain
URL: https://private.lumiku.com
```

---

## 📝 Deployment Checklist

Use this checklist for each deployment:

### Pre-Deployment
- [ ] Local development working on SQLite
- [ ] All tests passing
- [ ] PostgreSQL migrations generated
- [ ] Changes committed to `main` branch
- [ ] Database backup completed
- [ ] Environment variables reviewed

### Deployment
- [ ] Coolify environment variables set
- [ ] Database connectivity verified
- [ ] Force rebuild enabled (if needed)
- [ ] Deployment triggered
- [ ] Build logs monitored
- [ ] No errors in build process

### Post-Deployment
- [ ] Health check passing
- [ ] Admin login successful
- [ ] Frontend loads correctly
- [ ] API endpoints responding
- [ ] Database tables created
- [ ] Admin user exists
- [ ] Video upload test successful
- [ ] Processing test successful

### Rollback (If Needed)
- [ ] Previous deployment identified
- [ ] Rollback triggered
- [ ] Health check verified
- [ ] Functionality tested
- [ ] Issue documented

---

**End of Deployment Documentation**

*Keep this document updated with any changes to the deployment process.*
