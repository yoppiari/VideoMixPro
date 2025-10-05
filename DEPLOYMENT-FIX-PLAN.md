# VideoMixPro - Deployment Fix Plan & Reference
**Tanggal:** 2025-10-05
**Tujuan:** Memperbaiki semua issue lokal sebelum deploy ke Coolify untuk menghindari loop/restart

---

## 🔴 MASALAH YANG TERIDENTIFIKASI

### 1. Healthcheck Timing Issues
- **Lokasi:** `Dockerfile:316`
- **Masalah:**
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3
  ```
- **Dampak:** Start period 120s terlalu lama, container bisa di-restart oleh orchestrator
- **Fix:** Turunkan ke 60s, tambah proper readiness check

### 2. Database Initialization Script Issues
- **Lokasi:** `Dockerfile:215-284` (init-db.sh heredoc)
- **Masalah:**
  - Menjalankan `fix-failed-migration.js` yang bisa loop
  - `npx prisma db push --accept-data-loss` berbahaya untuk production
  - Copy-paste migrations dari `migrations-postgres` bisa conflict
  - Tidak ada proper error handling
- **Dampak:** Container bisa crash dan restart terus jika database initialization gagal
- **Fix:** Simplify script, hapus risky operations, tambah validations

### 3. Migration Strategy Issues
- **Lokasi:** `prisma/migrations/` dan `prisma/migrations-postgres/`
- **Masalah:**
  - Mixed SQLite + PostgreSQL migrations
  - Script copy migrations yang bisa overwrite
  - Tidak ada validation state sebelum apply
- **Dampak:** Migration conflicts, data loss, crash loop
- **Fix:** Clean migrations, use only PostgreSQL migrations for production

### 4. Supervisord Configuration Issues
- **Lokasi:** `Dockerfile:187-212`
- **Masalah:**
  ```ini
  [program:backend]
  autostart=true
  autorestart=true
  depends_on=backend  # Nginx depends on backend tapi tidak ada wait
  ```
- **Dampak:** Nginx bisa start sebelum backend ready, healthcheck fail
- **Fix:** Tambah proper wait mechanism, better dependency management

### 5. Environment Variable Issues
- **Lokasi:** `.env` (local menggunakan PostgreSQL production)
- **Masalah:**
  ```
  DATABASE_URL="postgres://...@107.155.75.50:5986/videomix"
  DATABASE_PROVIDER="postgresql"
  ```
- **Dampak:** Development bisa corrupt production database
- **Fix:** Pisahkan environment local vs production

### 6. Build Validation Issues
- **Masalah:**
  - Tidak ada pre-build validation
  - TypeScript errors bisa lolos (terlihat di logs)
  - Frontend build tidak ditest sebelum Docker build
- **Dampak:** Build gagal di tengah jalan, wasting time
- **Fix:** Create pre-deployment validation script

### 7. Debug Endpoints di Production
- **Lokasi:**
  - `src/index.ts:39-79` - /api/emergency-login
  - `src/index.ts:94-96` - /api/test
  - `src/routes/health.ts:16-70` - /debug-env, /debug-login
- **Masalah:** Debug endpoints exposed di production
- **Dampak:** Security risk
- **Fix:** Remove atau guard dengan environment check

---

## 🎯 RENCANA PERBAIKAN

### FASE 1: Environment Setup & Cleanup (15 menit)

#### 1.1 Pisahkan Environment Local vs Production
**File:** `.env` → `.env.local`
```bash
# .env.local - Development with SQLite
DATABASE_URL="file:./dev.db"
DATABASE_PROVIDER="sqlite"
NODE_ENV=development
PORT=3002
JWT_SECRET="dev-jwt-secret-key-for-local-development-only"
FRONTEND_URL="http://localhost:3000"
```

**File:** `.env.production` (baru)
```bash
# .env.production - Production with PostgreSQL (reference only, will use Coolify env vars)
DATABASE_URL="postgres://postgres:PASSWORD@107.155.75.50:5986/videomix"
DATABASE_PROVIDER="postgresql"
NODE_ENV=production
PORT=3002
JWT_SECRET="production-secret-from-coolify"
FRONTEND_URL="https://private.lumiku.com"
```

**Action:**
- Copy current `.env` to `.env.production` (as reference)
- Replace `.env` with SQLite config untuk development
- Update `.gitignore` untuk ignore `.env.local`
- Regenerate Prisma client untuk SQLite

#### 1.2 Clean Up Debug Endpoints
**File:** `src/index.ts`
- Wrap debug endpoints dengan `if (process.env.NODE_ENV === 'development')`
- Atau comment out untuk production build

**File:** `src/routes/health.ts`
- Wrap `/debug-env` dan `/debug-login` dengan env check

#### 1.3 Fix TypeScript Build Errors
**File:** `src/services/voice-over.service.ts` (sudah ada error di logs)
- Fix compilation errors
- Validate dengan `npm run build`

---

### FASE 2: Database & Migration Cleanup (20 menit)

#### 2.1 Clean Migration Files
**Action:**
```bash
# Remove SQLite migrations from production migrations
# Keep only PostgreSQL migrations
```

**File:** Create `scripts/validate-migrations.js`
```javascript
// Validate migration files sebelum deploy
// Check for conflicts, missing files, etc.
```

#### 2.2 Simplify init-db.sh
**File:** `Dockerfile` (heredoc at line 215)

**Perubahan:**
```bash
#!/bin/bash
set -e

echo "🚀 Initializing VideoMixPro Database..."

# 1. Validate environment
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set"
    exit 1
fi

# 2. Wait for database (with timeout)
echo "⏳ Waiting for PostgreSQL..."
timeout=60
while ! pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; do
    timeout=$((timeout - 1))
    if [ $timeout -le 0 ]; then
        echo "❌ Database timeout"
        exit 1
    fi
    sleep 1
done

# 3. Generate schema (safe)
echo "📝 Generating schema..."
node /app/scripts/generate-schema.js
npx prisma generate

# 4. Apply migrations (safe - no data loss)
echo "🔄 Applying migrations..."
if [ -d "/app/prisma/migrations-postgres" ] && [ ! -d "/app/prisma/migrations" ]; then
    cp -r /app/prisma/migrations-postgres /app/prisma/migrations
fi

npx prisma migrate deploy || {
    echo "⚠️ Migrate failed, trying db push..."
    npx prisma db push --skip-generate
}

# 5. Create admin (idempotent)
echo "👤 Creating admin..."
node /app/scripts/create-admin.js

echo "✅ Database ready"
```

#### 2.3 Create Migration Validation Script
**File:** `scripts/validate-migrations.js` (baru)
```javascript
// Check migrations are valid PostgreSQL
// No SQLite-specific syntax
// No conflicts
```

---

### FASE 3: Dockerfile Improvements (25 menit)

#### 3.1 Improve Healthcheck
**File:** `Dockerfile:316`
```dockerfile
# Reduce start period, improve check
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:3000/health || exit 1
```

#### 3.2 Add Database Wait Utility
**File:** Create `scripts/wait-for-db.sh`
```bash
#!/bin/bash
# Proper database wait with retry logic
# Will be used by supervisord before starting backend
```

#### 3.3 Improve Supervisord Config
**File:** `Dockerfile:187-212`
```ini
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisor/supervisord.pid

[program:backend]
command=/app/scripts/wait-for-db.sh && node -r module-alias/register dist/index.js
directory=/app
user=appuser
autostart=true
autorestart=true
startsecs=10
startretries=3
stderr_logfile=/var/log/supervisor/backend_stderr.log
stdout_logfile=/var/log/supervisor/backend_stdout.log
environment=NODE_ENV=production,PORT=3002

[program:nginx]
command=nginx -g "daemon off;"
user=appuser
autostart=true
autorestart=true
startsecs=5
stderr_logfile=/var/log/supervisor/nginx_stderr.log
stdout_logfile=/var/log/supervisor/nginx_stdout.log
```

#### 3.4 Improve Startup Script
**File:** `Dockerfile:320` (start.sh heredoc)
```bash
#!/bin/bash
set -e

echo "🚀 Starting VideoMixPro..."

# Initialize database (with better error handling)
if /app/init-db.sh; then
    echo "✅ Database initialized"
else
    echo "❌ Database initialization failed"
    echo "📋 Showing logs..."
    tail -n 50 /var/log/supervisor/*.log || true
    exit 1
fi

# Start supervisor
echo "🔄 Starting services..."
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
```

---

### FASE 4: Build & Validation (20 menit)

#### 4.1 Create Pre-Deployment Validation Script
**File:** `scripts/pre-deploy-check.js` (baru)
```javascript
#!/usr/bin/env node

/**
 * Pre-deployment validation checklist
 * Run this before building Docker image
 */

const checks = [
  'TypeScript builds without errors',
  'Frontend builds successfully',
  'Environment variables validated',
  'Migration files valid',
  'No debug endpoints in production',
  'Database schema valid'
];

// Implement each check
// Exit with error if any check fails
```

#### 4.2 Test Local Build
**Action:**
```bash
# Test TypeScript build
npm run build

# Test frontend build
cd frontend && npm run build

# Test Docker build (without running)
docker build -t videomixpro:test .

# Test with local PostgreSQL (if available)
# Or use docker-compose for full test
```

#### 4.3 Create Build Script
**File:** `scripts/build-for-production.sh` (baru)
```bash
#!/bin/bash
set -e

echo "🔍 Running pre-deployment checks..."
node scripts/pre-deploy-check.js

echo "🏗️ Building backend..."
npm run build

echo "🎨 Building frontend..."
cd frontend && npm run build && cd ..

echo "📦 Building Docker image..."
docker build -t videomixpro:latest .

echo "✅ Build complete - ready for deployment"
```

---

### FASE 5: Deployment Scripts & Documentation (15 mentin)

#### 5.1 Update deploy.sh
**File:** `deploy.sh`
- Add pre-deployment validation
- Better error messages
- Rollback capability

#### 5.2 Create Rollback Script
**File:** `scripts/rollback.sh` (baru)
```bash
#!/bin/bash
# Emergency rollback script
# Stop container, restore previous version
```

#### 5.3 Create Deployment Checklist
**File:** `DEPLOYMENT-CHECKLIST.md` (baru)
```markdown
# Pre-Deployment Checklist

## Before Building
- [ ] All TypeScript errors fixed
- [ ] Frontend builds successfully
- [ ] Tests passing
- [ ] Environment variables reviewed
- [ ] Debug endpoints removed/guarded
- [ ] Migration files validated

## Before Deploying
- [ ] Docker image builds successfully
- [ ] Local Docker test passed
- [ ] Database backup created
- [ ] Rollback script ready
- [ ] Monitoring prepared

## During Deployment
- [ ] Watch container logs
- [ ] Monitor healthchecks
- [ ] Test login endpoint
- [ ] Verify database connection

## After Deployment
- [ ] Application accessible
- [ ] Login works
- [ ] Database queries work
- [ ] No crash loops
```

#### 5.4 Update CLAUDE.md
**File:** `CLAUDE.md`
- Add deployment fix notes
- Reference this document
- Update troubleshooting section

---

## 🚀 EXECUTION ORDER

1. **Setup** (FASE 1)
   - Split environments
   - Remove debug endpoints
   - Fix TypeScript errors
   - Test local build

2. **Database** (FASE 2)
   - Clean migrations
   - Create validation script
   - Test migration process

3. **Docker** (FASE 3)
   - Update Dockerfile
   - Improve healthcheck
   - Better error handling
   - Test Docker build

4. **Validation** (FASE 4)
   - Create pre-deploy script
   - Run all checks
   - Document results

5. **Deploy** (FASE 5)
   - Update deploy scripts
   - Create rollback plan
   - Document checklist
   - Execute deployment

---

## 📊 SUCCESS CRITERIA

### Pre-Deployment
- ✅ `npm run build` succeeds
- ✅ `cd frontend && npm run build` succeeds
- ✅ `docker build` succeeds
- ✅ No TypeScript errors
- ✅ All validation checks pass

### Post-Deployment
- ✅ Container starts without crashes
- ✅ Healthcheck passes within 60s
- ✅ Database connection works
- ✅ Login endpoint works
- ✅ No crash loops for 5+ minutes
- ✅ Application accessible at https://private.lumiku.com

---

## 🆘 TROUBLESHOOTING REFERENCE

### If Container Keeps Restarting
1. Check logs: `docker logs videomixpro`
2. Check database connection: Connection string valid?
3. Check init-db.sh: Any errors in initialization?
4. Check supervisord: Services starting correctly?

### If Healthcheck Fails
1. Check /health endpoint: `curl http://localhost:3000/health`
2. Check backend logs: Is server running?
3. Check nginx: Is proxy working?
4. Increase start-period if database is slow

### If Database Migration Fails
1. Check migration files: Valid PostgreSQL syntax?
2. Check database state: `docker exec videomixpro npx prisma migrate status`
3. Manual fix: `docker exec videomixpro node /app/scripts/fix-failed-migration.js`
4. Nuclear option: Drop and recreate (BACKUP FIRST!)

### If Build Fails
1. Clear node_modules: `rm -rf node_modules && npm install`
2. Clear Docker cache: `docker system prune -a`
3. Check TypeScript errors: `npm run typecheck`
4. Check frontend errors: `cd frontend && npm run build`

---

## 📝 FILES TO BE MODIFIED

### New Files
- `scripts/pre-deploy-check.js` - Pre-deployment validation
- `scripts/validate-migrations.js` - Migration validation
- `scripts/wait-for-db.sh` - Database wait utility
- `scripts/build-for-production.sh` - Build automation
- `scripts/rollback.sh` - Emergency rollback
- `.env.local` - Local development environment
- `.env.production` - Production reference (not committed)
- `DEPLOYMENT-CHECKLIST.md` - Deployment checklist
- `DEPLOYMENT-FIX-PLAN.md` - This document

### Modified Files
- `Dockerfile` - Improved healthcheck, supervisord, init-db.sh, start.sh
- `deploy.sh` - Add validation, better error handling
- `src/index.ts` - Guard debug endpoints
- `src/routes/health.ts` - Guard debug endpoints
- `.env` - Switch to SQLite for development
- `.gitignore` - Ignore .env.local
- `CLAUDE.md` - Update with deployment fixes

---

## ⏱️ ESTIMATED TIMELINE

- **Fase 1:** 15 menit (Environment setup)
- **Fase 2:** 20 menit (Database cleanup)
- **Fase 3:** 25 menit (Dockerfile improvements)
- **Fase 4:** 20 menit (Build validation)
- **Fase 5:** 15 menit (Deployment scripts)
- **Testing:** 30 menit (Local testing)
- **Deployment:** 15 menit (Push to Coolify)

**Total:** ~2.5 jam (termasuk testing)

---

## 🎯 DEPLOYMENT STRATEGY

### Option A: Safe Deployment (Recommended)
1. Build dan test semua locally
2. Push ke Git
3. Let Coolify rebuild
4. Monitor closely
5. Rollback if issues

### Option B: Manual Deployment
1. Build locally
2. Push image to registry
3. Deploy ke Coolify
4. More control but more complex

**Recommendation:** Option A dengan full validation sebelumnya

---

**STATUS:** Ready for execution
**LAST UPDATED:** 2025-10-05 13:15 WIB
