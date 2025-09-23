# VideoMixPro - External PostgreSQL Deployment

## Overview

VideoMixPro now uses a **single unified Dockerfile** that connects to an **external PostgreSQL database**. This provides enterprise-grade database performance while maintaining simple container deployment.

## Architecture

The unified container includes:
- **Frontend**: React app built and served via Nginx on port 3000
- **Backend**: Node.js API server on port 3002
- **Database**: External PostgreSQL (always enforced in Docker)
- **FFmpeg**: Video processing capabilities
- **Supervisor**: Process management for Nginx + Node.js

**Important**: Docker containers are **hardcoded to use PostgreSQL** and will automatically:
- Force `DATABASE_PROVIDER="postgresql"`
- Generate PostgreSQL schema at startup
- Use PostgreSQL migrations
- Reject SQLite configuration

## Quick Deployment

### Option 1: Using the Deploy Script (Recommended)
```bash
./deploy.sh
```

### Option 2: Manual Docker Commands
```bash
# Build the image
docker build -t videomixpro:latest .

# Run the container with external PostgreSQL
docker run -d \
    --name videomixpro \
    -p 3000:3000 \
    -v videomixpro_uploads:/app/uploads \
    -v videomixpro_outputs:/app/outputs \
    -v videomixpro_logs:/app/logs \
    -v videomixpro_backups:/app/backups \
    -e DATABASE_URL="postgres://postgres:6LP0Ojegy7IUU6kaX9lLkmZRUiAdAUNOltWyL3LegfYGR6rPQtB4DUSVqjdA78ES@107.155.75.50:5986/videomix" \
    -e DATABASE_PROVIDER="postgresql" \
    -e JWT_SECRET="your-secure-secret" \
    videomixpro:latest
```

## Access

- **Application URL**: http://localhost:3000
- **Default Admin Credentials**:
  - Email: `admin@videomix.pro`
  - Password: `Admin123!`

## External Database Configuration

- **Type**: External PostgreSQL
- **Host**: 107.155.75.50
- **Port**: 5986
- **Database**: videomix
- **User**: postgres
- **Connection**: Automatic retry with 5-minute timeout

### Database Features

✅ **Automatic Migration**: Migrations deployed on container startup
- **Migration Files**: Located in `prisma/migrations/`
- **Auto-Deploy**: Runs `prisma migrate deploy` on startup
- **Validation**: Checks migration status and provides fallbacks
- **Admin User**: Automatically created with default credentials

## Container Management

```bash
# View all logs
docker logs -f videomixpro

# View specific service logs
docker exec videomixpro tail -f /var/log/supervisor/backend_stdout.log
docker exec videomixpro tail -f /var/log/supervisor/nginx_stdout.log

# Check database connection status
docker exec videomixpro /app/scripts/migrate.sh status

# Stop/Start/Restart container
docker stop videomixpro
docker start videomixpro
docker restart videomixpro

# Remove container (keeps volumes)
docker rm -f videomixpro

# Remove image
docker rmi videomixpro:latest
```

## Environment Variables

### Required Variables:
- `DATABASE_URL`: PostgreSQL connection string (required)
- `DATABASE_PROVIDER`: Automatically set to "postgresql" in Docker (do not override)

### Optional Variables:
- `JWT_SECRET`: Secret for JWT token signing
- `FRONTEND_URL`: Public URL of your application
- `NODE_ENV`: Environment (defaults to production)

### Example with Custom Variables:
```bash
docker run -d \
    --name videomixpro \
    -p 3000:3000 \
    -e DATABASE_URL="postgres://user:password@host:port/database" \
    -e JWT_SECRET="your-secure-jwt-secret" \
    -e FRONTEND_URL="https://yourdomain.com" \
    videomixpro:latest
    
# Note: DATABASE_PROVIDER is automatically set to "postgresql" in Docker
```

## Persistent Storage

The deployment uses Docker volumes for application data:
- `videomixpro_uploads`: User uploaded videos
- `videomixpro_outputs`: Processed video outputs
- `videomixpro_logs`: Application logs
- `videomixpro_backups`: Database backup files

**Database data** is stored in the external PostgreSQL server and persists independently of the container.

### Database Management Utilities

The container includes comprehensive migration utilities via `/app/scripts/migrate.sh`:

```bash
# Check migration status
docker exec videomixpro /app/scripts/migrate.sh status

# Run migrations manually
docker exec videomixpro /app/scripts/migrate.sh migrate

# Create/update admin user
docker exec videomixpro /app/scripts/migrate.sh admin

# Initialize database (migrations + admin)
docker exec videomixpro /app/scripts/migrate.sh init

# Create database backup
docker exec videomixpro /app/scripts/migrate.sh backup

# Restore from backup
docker exec videomixpro /app/scripts/migrate.sh restore /path/to/backup.sql
```

## Security Features

- ✅ Non-root user execution for application services
- ✅ Minimal Alpine Linux base
- ✅ Process isolation with Supervisor
- ✅ External PostgreSQL with secure authentication
- ✅ Health checks configured
- ✅ Secure file permissions
- ✅ Connection encryption support

## Production Considerations

1. **SSL/TLS**: Use a reverse proxy (nginx, Cloudflare) for HTTPS
2. **Domain**: Set `FRONTEND_URL` to your actual domain
3. **JWT Secret**: Use a strong, unique `JWT_SECRET`
4. **Database Security**: Ensure PostgreSQL has proper firewall rules
5. **Backups**: Regularly backup both Docker volumes and PostgreSQL
6. **Updates**: Rebuild and redeploy for updates
7. **Monitoring**: Monitor both container and database health

## Performance Tuning

### For High Traffic:
```bash
docker run -d \
    --name videomixpro \
    -p 3000:3000 \
    --memory=4g \
    --cpus=2 \
    videomixpro:latest
```

### Database Connection Pool:
The application automatically handles connection pooling to the external PostgreSQL database for optimal performance.

## Troubleshooting

### Check container status
```bash
docker ps
docker logs videomixpro
```

### Check database connection
```bash
# Test database connectivity
docker exec videomixpro /app/scripts/migrate.sh status

# View database connection logs
docker logs videomixpro | grep -E "(Database|PostgreSQL|Migration)"

# Check if external database is reachable
docker exec videomixpro nc -zv 107.155.75.50 5986
```

### Check individual services
```bash
# Backend API health
docker exec videomixpro curl -f http://localhost:3002/health

# Nginx status
docker exec videomixpro curl -f http://localhost:3000/health
```

### Access container shell
```bash
docker exec -it videomixpro sh
```

### Database issues
```bash
# Check application logs for database errors
docker exec videomixpro tail -f /var/log/supervisor/backend_stderr.log

# Manual database connection test
docker exec videomixpro /app/init-db.sh

# Restart application services
docker exec videomixpro supervisorctl restart backend
```

### Rebuild after changes
```bash
docker rm -f videomixpro
docker rmi videomixpro:latest
./deploy.sh
```

## Connection Details

Current external PostgreSQL configuration:
- **Host**: 107.155.75.50
- **Port**: 5986
- **Database**: videomix
- **User**: postgres
- **Connection String**: `postgres://postgres:***@107.155.75.50:5986/videomix`

## Advantages of External PostgreSQL

- ✅ **High Availability**: Database independent of container lifecycle
- ✅ **Scalability**: Dedicated database server resources
- ✅ **Performance**: Optimized PostgreSQL configuration
- ✅ **Backup/Recovery**: Professional database backup solutions
- ✅ **Multi-Environment**: Share database across multiple deployments
- ✅ **Monitoring**: Database-specific monitoring and alerting
- ✅ **Security**: Centralized database security management

## Migration from Embedded Database

If you were using the previous embedded PostgreSQL setup:

1. **Export data** from old container:
   ```bash
   docker exec old_container pg_dump -U videomixpro videomixpro > migration.sql
   ```

2. **Deploy with external PostgreSQL**:
   ```bash
   ./deploy.sh
   ```

3. **Import data** to external database:
   ```bash
   docker exec videomixpro /app/scripts/migrate.sh restore migration.sql
   ```

The external PostgreSQL setup provides enterprise-grade database capabilities with simplified application deployment.