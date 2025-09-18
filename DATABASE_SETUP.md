# Database Setup Instructions

## 🌟 NEW: Docker-Free Development Setup

**Good news!** Untuk development di laptop/PC dengan spec rendah, Anda TIDAK perlu Docker, PostgreSQL, atau Redis!

### Quick Development Setup (Recommended for Local Development)
```bash
# Run automated setup
npm run setup:dev

# That's it! SQLite and in-memory queue will be used automatically
```

## Production Database Setup

Untuk production deployment, Video Mixer Pro requires PostgreSQL dan Redis. Berikut adalah beberapa cara untuk setup:

## Option 1: Development Environment (No Installation Required!)

### Automatic Setup
```bash
# Everything is handled automatically
npm run setup:dev
```

### What You Get
- **SQLite**: File-based database, no server needed
- **In-Memory Queue**: No Redis required
- **Local Storage**: Files stored locally
- **Zero Configuration**: Works out of the box

### Benefits
- ✓ No Docker needed
- ✓ No PostgreSQL installation
- ✓ No Redis installation
- ✓ Runs on low-spec laptops (< 500MB RAM)
- ✓ Instant startup
- ✓ Easy database reset (just delete dev.db file)

## Option 2: Docker Setup (For Production-like Environment)

### Install Docker Desktop
1. Download Docker Desktop dari https://www.docker.com/products/docker-desktop/
2. Install dan start Docker Desktop
3. Verify installation: `docker --version`

### Run Databases dengan Docker
```bash
# Start PostgreSQL
docker run -d \
  --name videomixpro-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=videomixpro \
  -e POSTGRES_USER=postgres \
  -p 5432:5432 \
  postgres:15

# Start Redis
docker run -d \
  --name videomixpro-redis \
  -p 6379:6379 \
  redis:7-alpine

# Check containers are running
docker ps
```

## Option 3: Manual Installation (Windows)

### Install PostgreSQL
1. Download PostgreSQL dari https://www.postgresql.org/download/windows/
2. Run installer dengan settings:
   - Port: 5432
   - Username: postgres
   - Password: password
   - Database: postgres (default)
3. Verify installation: `psql --version`

### Install Redis
1. Download Redis untuk Windows dari https://github.com/MicrosoftArchive/redis/releases
2. Extract dan run `redis-server.exe`
3. Default port: 6379
4. Test: `redis-cli ping` (should return PONG)

### Create Database
```bash
# Connect to PostgreSQL
psql -U postgres -h localhost

# Create database
CREATE DATABASE videomixpro;

# Exit
\q
```

## Option 4: Cloud Services (Production)

### PostgreSQL (AWS RDS / Google Cloud SQL)
1. Create PostgreSQL instance
2. Note connection details
3. Update DATABASE_URL in .env

### Redis (AWS ElastiCache / Redis Cloud)
1. Create Redis instance
2. Note connection details
3. Update REDIS_URL in .env

## Verify Database Connections

```bash
# Test PostgreSQL connection
psql "postgresql://postgres:password@localhost:5432/videomixpro"

# Test Redis connection
redis-cli -h localhost -p 6379 ping
```

## Run Database Migrations

### For Development (SQLite)
```bash
# Generate Prisma client for SQLite
npm run db:dev:generate

# Run migrations on SQLite
npm run db:dev:migrate

# Open Prisma Studio for SQLite
npm run db:dev:studio
```

### For Production (PostgreSQL)
```bash
# Generate Prisma client for PostgreSQL
npm run db:prod:generate

# Deploy migrations to PostgreSQL
npm run db:prod:migrate

# Open Prisma Studio for PostgreSQL
npm run db:studio
```

## Environment Configuration

### Development (.env.development)
```env
# SQLite for development
NODE_ENV=development
DATABASE_URL_DEV="file:./dev.db"
DATABASE_PROVIDER="sqlite"
USE_IN_MEMORY_QUEUE=true

# These are not used in development but kept for production
DATABASE_URL="postgresql://postgres:password@localhost:5432/videomixpro?schema=public"
REDIS_URL="redis://localhost:6379"
```

### Production (.env)
```env
# PostgreSQL for production
NODE_ENV=production
DATABASE_URL="postgresql://username:password@host:5432/videomixpro?schema=public"
REDIS_URL="redis://username:password@host:6379"
USE_IN_MEMORY_QUEUE=false
```

## Troubleshooting

### PostgreSQL Issues
- **Connection refused**: Check PostgreSQL service is running
- **Authentication failed**: Verify username/password
- **Database not found**: Create videomixpro database

### Redis Issues
- **Connection refused**: Check Redis service is running
- **Permission denied**: Check Redis configuration

### FFmpeg Requirements
Video Mixer Pro juga membutuhkan FFmpeg untuk video processing:

#### Windows
```bash
# Using Chocolatey
choco install ffmpeg

# Or download dari https://ffmpeg.org/download.html
```

#### Verify FFmpeg
```bash
ffmpeg -version
ffprobe -version
```

## Next Steps

### For Development (Recommended for local work)
```bash
# 1. Run setup (if not done)
npm run setup:dev

# 2. Start API server
npm run dev

# 3. Start workers (in new terminal)
npm run queue:dev

# 4. Check health
http://localhost:3000/health

# 5. View database (optional)
npm run db:dev:studio
```

### For Production
```bash
# 1. Ensure PostgreSQL & Redis are running
# 2. Set NODE_ENV=production
# 3. Configure database URLs in .env
# 4. Run migrations
npm run db:prod:migrate

# 5. Build and start
npm run build
npm start
```

## Migration Path: Development to Production

1. **Development Phase**: Use SQLite + in-memory queue
2. **Staging Phase**: Test with PostgreSQL + Redis locally
3. **Production Phase**: Deploy with cloud services

The application automatically switches between environments based on NODE_ENV!

### Key Advantages of This Setup
- ✅ **Development**: No external dependencies, runs anywhere
- ✅ **Production**: Full performance with PostgreSQL & Redis
- ✅ **Same Codebase**: Automatic environment detection
- ✅ **Easy Testing**: Switch environments with one variable
- ✅ **Cost Effective**: Free development, pay only for production

Untuk detailed production deployment, lihat `docs/deployment.md`.