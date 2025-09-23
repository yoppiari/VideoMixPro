# VideoMixPro - Database Configuration Guide

## Overview

VideoMixPro supports both **SQLite** (for development) and **PostgreSQL** (for production) databases seamlessly. The application automatically detects and adapts to the configured database provider.

## Quick Setup

### SQLite (Development)

```bash
# 1. Configure environment
cp .env.sqlite .env

# 2. Generate schema
node scripts/generate-schema.js

# 3. Generate Prisma client
npx prisma generate

# 4. Run migrations
npx prisma migrate dev

# 5. Create admin user
node scripts/reset-password.js
```

### PostgreSQL (Production/External)

```bash
# 1. Configure environment
cp .env.postgres .env

# 2. Generate schema
node scripts/generate-schema.js

# 3. Generate Prisma client
npx prisma generate

# 4. Deploy migrations
npx prisma migrate deploy

# 5. Create admin user
node scripts/reset-password.js
```

## Environment Configuration

### SQLite Configuration (.env.sqlite)
```env
DATABASE_URL="file:./dev.db"
DATABASE_PROVIDER="sqlite"
NODE_ENV=development
PORT=3002
JWT_SECRET="your-secret-key"
FRONTEND_URL="http://localhost:3000"
```

### PostgreSQL Configuration (.env.postgres)
```env
DATABASE_URL="postgres://user:password@host:port/database"
DATABASE_PROVIDER="postgresql"
NODE_ENV=production
PORT=3002
JWT_SECRET="your-secure-secret-key"
FRONTEND_URL="https://yourdomain.com"
```

## Database Compatibility Features

### 1. Automatic Schema Generation
The `scripts/generate-schema.js` script automatically generates the correct Prisma schema based on your `DATABASE_PROVIDER` environment variable:

```bash
# Generates SQLite or PostgreSQL schema automatically
node scripts/generate-schema.js
```

### 2. Database Helper Utilities
The `DbHelper` class (in `src/utils/db-helper.ts`) provides compatibility utilities:

- **JSON Serialization**: Handles differences in JSON storage between SQLite (string) and PostgreSQL (native JSON)
- **Enum Validation**: Validates string-based enums (used instead of native enums for compatibility)
- **BigInt Conversion**: Safely converts between BigInt and number types
- **Case-Insensitive Search**: Handles differences in LIKE query behavior
- **Transaction Options**: Provides database-specific transaction configurations

### 3. Unified Model Structure
- All models use strings for enum-like fields (instead of native enums)
- JSON fields are stored as strings in both databases
- BigInt is used for large numbers (supported by both databases)
- Consistent field naming with snake_case mapping

## Migration Management

### Separate Migration Directories
- **PostgreSQL migrations**: `prisma/migrations-postgres/`
- **SQLite migrations**: `prisma/migrations-sqlite/`
- Active migrations directory: `prisma/migrations/`

### Switching Between Databases

```bash
# Switch to SQLite
mv prisma/migrations prisma/migrations-postgres
mv prisma/migrations-sqlite prisma/migrations
cp .env.sqlite .env
node scripts/generate-schema.js
npx prisma generate

# Switch to PostgreSQL
mv prisma/migrations prisma/migrations-sqlite
mv prisma/migrations-postgres prisma/migrations
cp .env.postgres .env
node scripts/generate-schema.js
npx prisma generate
```

## Docker Deployment

**Docker containers are hardcoded to use PostgreSQL only** and will automatically:
- Force `DATABASE_PROVIDER="postgresql"`
- Generate PostgreSQL schema at startup
- Use PostgreSQL migration files
- Ignore any SQLite configuration

```bash
# Build and run with external PostgreSQL
docker build -t videomixpro .
docker run -d \
    -p 3000:3000 \
    -e DATABASE_URL="postgres://..." \
    videomixpro
    
# DATABASE_PROVIDER is automatically set - do not specify it
```

## Database-Specific Considerations

### SQLite
- **Pros**: Zero configuration, file-based, perfect for development
- **Cons**: Limited concurrent writes, no native JSON support
- **Use Case**: Development, testing, single-user scenarios
- **File Location**: `prisma/dev.db`

### PostgreSQL
- **Pros**: High performance, native JSON, better concurrency, full-text search
- **Cons**: Requires server setup, more resource intensive
- **Use Case**: Production, multi-user scenarios, high traffic
- **Connection**: External server or Docker container

## Common Commands

```bash
# Check current database provider
echo $DATABASE_PROVIDER

# View current schema
cat prisma/schema.prisma | head -10

# Test database connection
npx prisma db pull --print

# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# Open database GUI
npx prisma studio

# Backup database
# SQLite
cp prisma/dev.db prisma/backup-$(date +%Y%m%d).db

# PostgreSQL
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

## Enum Values

The application uses string constants instead of database enums for compatibility:

- **User.role**: `USER`, `ADMIN`
- **User.licenseType**: `FREE`, `BASIC`, `PRO`, `ENTERPRISE`
- **ProcessingJob.status**: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`
- **CreditTransaction.type**: `PURCHASE`, `USAGE`, `REFUND`, `BONUS`
- **Notification.type**: `INFO`, `SUCCESS`, `WARNING`, `ERROR`

## Troubleshooting

### Provider Mismatch Error
If you see `The datasource provider specified in your schema does not match the one specified in the migration_lock.toml`:

```bash
# Remove migrations and regenerate
rm -rf prisma/migrations
node scripts/generate-schema.js
npx prisma generate
npx prisma migrate dev --name init
```

### Connection Issues
```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1"

# Test SQLite file permissions
ls -la prisma/dev.db
```

### Schema Out of Sync
```bash
# Regenerate schema and client
node scripts/generate-schema.js
npx prisma generate
npx prisma migrate dev
```

## Best Practices

1. **Development**: Use SQLite for fast iteration
2. **Staging**: Use PostgreSQL with same version as production
3. **Production**: Use managed PostgreSQL service
4. **Migrations**: Always test migrations on a copy of production data
5. **Backups**: Automate regular backups for both databases
6. **Monitoring**: Set up connection pool monitoring for PostgreSQL

## Performance Tips

### SQLite
- Enable WAL mode for better concurrency
- Use VACUUM periodically to optimize file size
- Keep database file on SSD for best performance

### PostgreSQL
- Configure connection pooling (Prisma handles this)
- Set appropriate `max_connections` based on load
- Use indexes for frequently queried fields
- Enable query logging in development

## Security Considerations

1. **Never commit .env files** with production credentials
2. **Use strong passwords** for PostgreSQL
3. **Enable SSL/TLS** for PostgreSQL connections in production
4. **Restrict database access** by IP/firewall rules
5. **Rotate credentials** regularly
6. **Encrypt backups** before storing