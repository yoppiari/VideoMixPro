# Troubleshooting Guide

## Overview

This guide covers common issues, debugging techniques, and solutions for Video Mixer Pro. It's organized by component and includes step-by-step resolution procedures.

## General Debugging

### Log Analysis

**Log Locations:**
```bash
# Application logs
/app/logs/error.log
/app/logs/combined.log

# PM2 logs (if using PM2)
~/.pm2/logs/videomixpro-api-error.log
~/.pm2/logs/videomixpro-api-out.log

# Docker logs
docker logs videomixpro_api_1
docker logs videomixpro_worker_1

# System logs
/var/log/nginx/error.log
/var/log/postgresql/postgresql.log
```

**Log Analysis Commands:**
```bash
# Check recent errors
tail -f /app/logs/error.log

# Search for specific errors
grep -i "error" /app/logs/combined.log | tail -20

# Check application startup
grep "Server running" /app/logs/combined.log

# Monitor real-time logs
journalctl -f -u videomixpro
```

### Health Check Script

```bash
#!/bin/bash
# health-check.sh

echo "🏥 Video Mixer Pro Health Check"
echo "=================================="

# Check API server
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ API Server: Healthy"
else
    echo "❌ API Server: Unhealthy"
fi

# Check database connection
if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "✅ Database: Connected"
else
    echo "❌ Database: Connection failed"
fi

# Check Redis connection
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis: Connected"
else
    echo "❌ Redis: Connection failed"
fi

# Check disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -lt 90 ]; then
    echo "✅ Disk Space: ${DISK_USAGE}% used"
else
    echo "⚠️ Disk Space: ${DISK_USAGE}% used (High usage)"
fi

# Check FFmpeg
if ffmpeg -version > /dev/null 2>&1; then
    echo "✅ FFmpeg: Available"
else
    echo "❌ FFmpeg: Not available"
fi

echo "=================================="
```

## Application Issues

### 1. Server Won't Start

**Symptoms:**
- Application crashes on startup
- "Error: listen EADDRINUSE :::3000" message
- "Cannot connect to database" error

**Diagnosis:**
```bash
# Check if port is already in use
sudo netstat -tulpn | grep :3000
sudo lsof -i :3000

# Check environment variables
env | grep DATABASE_URL
env | grep JWT_SECRET

# Verify database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check Node.js version
node --version  # Should be 18+
```

**Solutions:**

**Port Already in Use:**
```bash
# Kill process using the port
sudo kill -9 $(lsof -ti:3000)

# Or use different port
export PORT=3001
npm run dev
```

**Database Connection Issues:**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql
sudo systemctl start postgresql

# Verify database exists
psql -U postgres -c "\l" | grep videomixpro

# Create database if missing
createdb videomixpro
npm run db:migrate
```

**Missing Environment Variables:**
```bash
# Copy example environment
cp .env.example .env

# Edit with correct values
nano .env

# Source environment
source .env
```

### 2. Authentication Errors

**Symptoms:**
- "Invalid token" responses
- "JWT malformed" errors
- Users can't log in despite correct credentials

**Diagnosis:**
```bash
# Check JWT secret
echo $JWT_SECRET | wc -c  # Should be > 32 characters

# Verify token format
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/v1/users/profile

# Check user in database
psql $DATABASE_URL -c "SELECT id, email, is_active FROM users WHERE email = 'user@example.com';"
```

**Solutions:**

**Invalid JWT Secret:**
```bash
# Generate new secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Update environment
export JWT_SECRET="your-new-secret"
```

**Token Expiration Issues:**
```bash
# Check token expiry setting
echo $JWT_EXPIRES_IN  # Should be like "24h"

# Clear expired tokens (client-side)
# Users need to log in again
```

**Password Hash Issues:**
```bash
# Reset user password
psql $DATABASE_URL -c "
UPDATE users
SET password = '$2b$12$newhashedpassword'
WHERE email = 'user@example.com';
"
```

### 3. File Upload Problems

**Symptoms:**
- "File too large" errors
- Upload timeout
- "Invalid file type" rejections

**Diagnosis:**
```bash
# Check upload directory permissions
ls -la uploads/
stat uploads/

# Check available disk space
df -h

# Verify file size limits
echo $MAX_FILE_SIZE
grep client_max_body_size /etc/nginx/sites-available/videomixpro

# Test upload directly
curl -X POST http://localhost:3000/api/v1/videos/upload \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "videos=@test.mp4" \
     -F "projectId=project-id"
```

**Solutions:**

**Permission Issues:**
```bash
# Fix upload directory permissions
sudo chown -R www-data:www-data uploads/
sudo chmod -R 755 uploads/

# For Docker
docker exec videomixpro_api_1 chown -R nodejs:nodejs /app/uploads
```

**Size Limit Issues:**
```bash
# Update application limit
export MAX_FILE_SIZE="1GB"

# Update Nginx limit
sudo nano /etc/nginx/sites-available/videomixpro
# Add: client_max_body_size 1G;
sudo systemctl reload nginx

# Update Docker if needed
# In docker-compose.yml, add environment variable
```

**Storage Space Issues:**
```bash
# Clean old files
find uploads/ -type f -mtime +7 -delete
find outputs/ -type f -mtime +30 -delete

# Move to S3 (if configured)
aws s3 sync uploads/ s3://videomixpro-storage/uploads/
```

## Database Issues

### 1. Connection Problems

**Symptoms:**
- "Connection terminated unexpectedly"
- "Too many connections" errors
- Slow query performance

**Diagnosis:**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection count
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Check for long-running queries
psql $DATABASE_URL -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
"

# Check database size
psql $DATABASE_URL -c "
SELECT pg_size_pretty(pg_database_size('videomixpro'));
"
```

**Solutions:**

**Too Many Connections:**
```bash
# Kill idle connections
psql $DATABASE_URL -c "
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'videomixpro'
  AND pid <> pg_backend_pid()
  AND state = 'idle'
  AND state_change < current_timestamp - INTERVAL '10' MINUTE;
"

# Increase connection limit
sudo nano /etc/postgresql/13/main/postgresql.conf
# max_connections = 200
sudo systemctl restart postgresql
```

**Slow Queries:**
```bash
# Enable slow query logging
psql $DATABASE_URL -c "ALTER SYSTEM SET log_min_duration_statement = 1000;"
psql $DATABASE_URL -c "SELECT pg_reload_conf();"

# Analyze slow queries
sudo tail -f /var/log/postgresql/postgresql-13-main.log | grep "duration:"

# Check missing indexes
psql $DATABASE_URL -c "
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY n_distinct DESC;
"
```

### 2. Migration Issues

**Symptoms:**
- Migration fails with constraint errors
- "relation already exists" errors
- Data type mismatch errors

**Diagnosis:**
```bash
# Check migration status
npm run db:status

# View migration history
psql $DATABASE_URL -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"

# Check schema differences
npx prisma db diff
```

**Solutions:**

**Failed Migration Recovery:**
```bash
# Reset to last known good state
npm run db:reset

# Or manually fix and retry
psql $DATABASE_URL -c "DELETE FROM _prisma_migrations WHERE migration_name = 'failed_migration';"
npm run db:migrate
```

**Constraint Conflicts:**
```bash
# Check existing constraints
psql $DATABASE_URL -c "
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'your_table'::regclass;
"

# Drop problematic constraint if safe
psql $DATABASE_URL -c "ALTER TABLE your_table DROP CONSTRAINT constraint_name;"
```

## Video Processing Issues

### 1. FFmpeg Problems

**Symptoms:**
- "FFmpeg not found" errors
- Video processing jobs stuck
- "Unsupported codec" errors

**Diagnosis:**
```bash
# Check FFmpeg installation
ffmpeg -version
ffprobe -version

# Test FFmpeg with sample file
ffmpeg -i sample.mp4 -t 5 test_output.mp4

# Check FFmpeg paths
echo $FFMPEG_PATH
echo $FFPROBE_PATH

# Test video processing manually
node -e "
const ffmpeg = require('fluent-ffmpeg');
ffmpeg('test.mp4').output('output.mp4').run();
"
```

**Solutions:**

**Missing FFmpeg:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# CentOS/RHEL
sudo yum install epel-release
sudo yum install ffmpeg

# macOS
brew install ffmpeg

# Verify installation
which ffmpeg
which ffprobe
```

**Path Configuration:**
```bash
# Update environment variables
export FFMPEG_PATH="/usr/bin/ffmpeg"
export FFPROBE_PATH="/usr/bin/ffprobe"

# For Docker
# Add to Dockerfile:
# ENV FFMPEG_PATH="/usr/bin/ffmpeg"
# ENV FFPROBE_PATH="/usr/bin/ffprobe"
```

**Codec Issues:**
```bash
# Check available codecs
ffmpeg -codecs | grep h264
ffmpeg -codecs | grep aac

# Install additional codecs if needed
sudo apt install ubuntu-restricted-extras
```

### 2. Queue Processing Problems

**Symptoms:**
- Jobs stuck in "PENDING" status
- Workers not processing jobs
- Queue memory issues

**Diagnosis:**
```bash
# Check Redis connection
redis-cli ping

# Check queue status
redis-cli llen "bull:video processing:waiting"
redis-cli llen "bull:video processing:active"
redis-cli llen "bull:video processing:failed"

# Check worker processes
ps aux | grep "queue:dev"
ps aux | grep node

# Check memory usage
free -h
top -p $(pgrep -f "queue:dev")
```

**Solutions:**

**Redis Connection Issues:**
```bash
# Restart Redis
sudo systemctl restart redis-server

# Check Redis configuration
redis-cli config get maxmemory
redis-cli config set maxmemory 512mb
redis-cli config set maxmemory-policy allkeys-lru
```

**Stuck Jobs:**
```bash
# Clear stuck jobs
redis-cli del "bull:video processing:waiting"
redis-cli del "bull:video processing:active"

# Restart workers
pm2 restart videomixpro-worker
# Or for Docker
docker restart videomixpro_worker_1
```

**Memory Issues:**
```bash
# Reduce worker concurrency
# In worker configuration:
# concurrency: 1  // Reduce from 3 to 1

# Monitor memory usage
watch "ps aux | grep node | grep -v grep"

# Add swap if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## Performance Issues

### 1. Slow API Response

**Symptoms:**
- High response times (>2 seconds)
- Timeout errors
- CPU/Memory usage spikes

**Diagnosis:**
```bash
# Monitor API response times
curl -w "%{time_total}\n" -o /dev/null -s http://localhost:3000/api/v1/projects

# Check system resources
htop
iostat -x 1

# Profile database queries
psql $DATABASE_URL -c "
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
"

# Check for N+1 queries
# Enable query logging and analyze patterns
```

**Solutions:**

**Database Optimization:**
```sql
-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_projects_user_id_created_at
ON projects(user_id, created_at DESC);

-- Update table statistics
ANALYZE projects;
ANALYZE video_files;

-- Increase shared_buffers
ALTER SYSTEM SET shared_buffers = '256MB';
SELECT pg_reload_conf();
```

**Application Optimization:**
```typescript
// Add pagination to large queries
const projects = await prisma.project.findMany({
  where: { userId },
  take: 20,
  skip: (page - 1) * 20,
  orderBy: { createdAt: 'desc' }
});

// Use select to limit fields
const users = await prisma.user.findMany({
  select: { id: true, email: true, firstName: true }
});
```

**Caching Implementation:**
```typescript
// Add Redis caching
const cachedProjects = await redis.get(`projects:${userId}`);
if (cachedProjects) {
  return JSON.parse(cachedProjects);
}

const projects = await getProjectsFromDB(userId);
await redis.setex(`projects:${userId}`, 300, JSON.stringify(projects));
```

### 2. File Storage Issues

**Symptoms:**
- Slow file uploads/downloads
- Disk space warnings
- File corruption

**Diagnosis:**
```bash
# Check disk I/O
iostat -x 1 5

# Check file system
df -h
df -i  # Check inode usage

# Test file system performance
dd if=/dev/zero of=testfile bs=1M count=100
rm testfile

# Check for corrupted files
find uploads/ -type f -exec file {} \; | grep -v "MP4\|MOV\|AVI"
```

**Solutions:**

**Storage Performance:**
```bash
# Move to SSD if on HDD
# Configure proper mount options
sudo mount -o noatime,nodiratime /dev/sdb1 /app/uploads

# Use separate disk for uploads/outputs
sudo mkdir /mnt/videos
sudo mount /dev/sdc1 /mnt/videos
ln -s /mnt/videos /app/uploads
```

**Space Management:**
```bash
# Implement cleanup job
cat > cleanup.sh << 'EOF'
#!/bin/bash
# Delete files older than 30 days
find /app/uploads -type f -mtime +30 -delete
find /app/outputs -type f -mtime +7 -delete

# Clean temporary processing files
find /tmp -name "videomixpro_*" -mtime +1 -delete
EOF

# Add to crontab
crontab -e
# 0 2 * * * /opt/videomixpro/cleanup.sh
```

## Network Issues

### 1. API Connection Problems

**Symptoms:**
- "Connection refused" errors
- Intermittent connectivity
- SSL certificate errors

**Diagnosis:**
```bash
# Test connectivity
curl -I http://localhost:3000/health
curl -I https://api.videomixpro.com/health

# Check SSL certificate
openssl s_client -connect api.videomixpro.com:443 -servername api.videomixpro.com

# Check DNS resolution
nslookup api.videomixpro.com
dig api.videomixpro.com

# Check firewall
sudo ufw status
sudo iptables -L
```

**Solutions:**

**SSL Issues:**
```bash
# Renew Let's Encrypt certificate
sudo certbot renew

# Check certificate expiry
openssl x509 -in /etc/letsencrypt/live/api.videomixpro.com/fullchain.pem -text -noout | grep "Not After"

# Test SSL configuration
curl -I https://api.videomixpro.com/health
```

**Firewall Configuration:**
```bash
# Allow necessary ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow ssh

# Check if application port is accessible internally
telnet localhost 3000
```

## Docker-Specific Issues

### 1. Container Problems

**Symptoms:**
- Containers won't start
- "No space left on device" errors
- Image build failures

**Diagnosis:**
```bash
# Check container status
docker ps -a
docker logs videomixpro_api_1

# Check Docker disk usage
docker system df

# Check container resources
docker stats

# Inspect container configuration
docker inspect videomixpro_api_1
```

**Solutions:**

**Disk Space Issues:**
```bash
# Clean up Docker
docker system prune -a
docker volume prune

# Remove old images
docker image prune -a

# Check volume usage
docker volume ls
```

**Build Issues:**
```bash
# Build with no cache
docker build --no-cache -t videomixpro .

# Check Dockerfile syntax
docker build --dry-run .

# Increase build memory if needed
docker build --memory=4g -t videomixpro .
```

**Container Startup Issues:**
```bash
# Check environment variables
docker exec videomixpro_api_1 env

# Check file permissions
docker exec videomixpro_api_1 ls -la /app

# Debug container startup
docker run -it --entrypoint /bin/sh videomixpro:latest
```

## Monitoring & Alerting

### Setting Up Alerts

**Disk Space Alert:**
```bash
#!/bin/bash
# disk-alert.sh
THRESHOLD=90
USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

if [ $USAGE -gt $THRESHOLD ]; then
  echo "ALERT: Disk usage is ${USAGE}% on $(hostname)" | \
  mail -s "Disk Space Alert" admin@videomixpro.com
fi
```

**Application Health Monitor:**
```bash
#!/bin/bash
# health-monitor.sh
if ! curl -f http://localhost:3000/health > /dev/null 2>&1; then
  echo "ALERT: API server is down on $(hostname)" | \
  mail -s "API Down Alert" admin@videomixpro.com

  # Attempt automatic restart
  pm2 restart videomixpro-api
fi
```

**Database Connection Monitor:**
```bash
#!/bin/bash
# db-monitor.sh
if ! pg_isready -h localhost -p 5432; then
  echo "ALERT: Database connection failed on $(hostname)" | \
  mail -s "Database Alert" admin@videomixpro.com
fi
```

## Emergency Procedures

### 1. Complete System Recovery

```bash
#!/bin/bash
# emergency-recovery.sh

echo "🚨 Starting emergency recovery procedure..."

# 1. Stop all services
sudo systemctl stop nginx
pm2 stop all
sudo systemctl stop postgresql
sudo systemctl stop redis

# 2. Check system resources
df -h
free -h

# 3. Start critical services
sudo systemctl start postgresql
sudo systemctl start redis

# 4. Restore from backup if needed
if [ "$1" = "restore" ]; then
  echo "Restoring from backup..."
  gunzip -c /backups/latest.sql.gz | psql $DATABASE_URL
fi

# 5. Start application
npm run build
pm2 start ecosystem.config.js

# 6. Start web server
sudo systemctl start nginx

# 7. Verify health
sleep 10
curl -f http://localhost:3000/health && echo "✅ Recovery successful" || echo "❌ Recovery failed"
```

### 2. Rollback Procedure

```bash
#!/bin/bash
# rollback.sh

echo "🔄 Starting rollback procedure..."

# 1. Stop current version
pm2 stop all

# 2. Checkout previous version
git checkout HEAD~1

# 3. Restore dependencies
npm ci

# 4. Rebuild
npm run build

# 5. Rollback database if needed
if [ "$1" = "database" ]; then
  psql $DATABASE_URL < /backups/pre-migration.sql
fi

# 6. Start services
pm2 start ecosystem.config.js

echo "✅ Rollback completed"
```

This troubleshooting guide should help identify and resolve most common issues encountered with Video Mixer Pro.