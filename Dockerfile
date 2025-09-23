# VideoMixPro - Unified Dockerfile for Frontend + Backend (External PostgreSQL)
# Multi-stage build combining React frontend and Node.js backend with external PostgreSQL

# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci --legacy-peer-deps

# Copy frontend source
COPY frontend/public ./public
COPY frontend/src ./src
COPY frontend/tsconfig.json ./
COPY frontend/tailwind.config.js ./
COPY frontend/postcss.config.js ./

# Build React application
RUN npm run build

# Stage 2: Build Backend
FROM node:18-alpine AS backend-builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy backend package files
COPY package*.json ./
COPY tsconfig.json ./

# Install backend dependencies
RUN npm ci

# Copy backend source
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Build backend
RUN npm run build

# Stage 3: Production Runtime (External PostgreSQL)
FROM node:18-alpine AS production

# Install system dependencies (no PostgreSQL - using external)
RUN apk add --no-cache \
    ffmpeg \
    nginx \
    supervisor \
    curl \
    bash

# Create app user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy backend package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built backend from builder
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy Prisma schema and migration files
COPY prisma ./prisma

# Copy migration utilities
COPY scripts ./scripts
RUN chmod +x ./scripts/*.sh

# Copy built frontend from builder
COPY --from=frontend-builder /app/frontend/build ./public

# Create necessary directories
RUN mkdir -p \
    uploads \
    outputs \
    logs \
    temp \
    receipts \
    invoices \
    backups \
    /var/log/nginx \
    /var/cache/nginx \
    /run/nginx

# Copy nginx configuration
COPY <<EOF /etc/nginx/nginx.conf
user appuser;
worker_processes auto;
pid /run/nginx/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;
    
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # Frontend server
    server {
        listen 3000;
        server_name localhost;
        root /app/public;
        index index.html;
        
        # Serve static files
        location /static/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        # API proxy to backend
        location /api/ {
            proxy_pass http://localhost:3002;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
        
        # Health check endpoint
        location /health {
            proxy_pass http://localhost:3002/health;
        }
        
        # React Router - serve index.html for all routes
        location / {
            try_files \$uri \$uri/ /index.html;
        }
    }
}
EOF

# Copy supervisor configuration (no PostgreSQL service)
COPY <<EOF /etc/supervisor/conf.d/supervisord.conf
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisor/supervisord.pid

[program:backend]
command=node dist/index.js
directory=/app
user=appuser
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/backend_stderr.log
stdout_logfile=/var/log/supervisor/backend_stdout.log
environment=NODE_ENV=production,PORT=3002

[program:nginx]
command=nginx -g "daemon off;"
user=appuser
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/nginx_stderr.log
stdout_logfile=/var/log/supervisor/nginx_stdout.log
depends_on=backend
EOF

# Create database initialization script for external PostgreSQL
COPY <<EOF /app/init-db.sh
#!/bin/bash
set -e

echo "Initializing external PostgreSQL database..."

# Force PostgreSQL configuration for Docker
export DATABASE_PROVIDER="postgresql"
echo "🔧 Docker container configured for PostgreSQL"

# Validate required environment variables
if [ -z "\$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is required"
    exit 1
fi

# Generate PostgreSQL schema
echo "📝 Generating PostgreSQL schema..."
node scripts/generate-schema.js

# Generate Prisma client for PostgreSQL
echo "🔄 Generating Prisma client..."
npx prisma generate

echo "📡 Connecting to external PostgreSQL database..."
echo "🔗 Database URL: \${DATABASE_URL%@*}@***" # Hide password in logs

# Wait for external PostgreSQL to be ready
echo "⏳ Waiting for external PostgreSQL to be ready..."
for i in {1..60}; do
    if npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
        echo "✅ External PostgreSQL is ready"
        break
    fi
    
    if [ \$i -eq 60 ]; then
        echo "❌ Failed to connect to external PostgreSQL after 5 minutes"
        exit 1
    fi
    
    echo "⏳ Waiting for database... (attempt \$i/60)"
    sleep 5
done

# Ensure PostgreSQL migrations are active
echo "🔄 Setting up PostgreSQL migrations..."

# Switch to PostgreSQL migrations if they exist
if [ -d "/app/prisma/migrations-postgres" ] && [ ! -d "/app/prisma/migrations" ]; then
    echo "📂 Activating PostgreSQL migration directory..."
    mv /app/prisma/migrations-postgres /app/prisma/migrations
elif [ -d "/app/prisma/migrations-postgres" ] && [ -d "/app/prisma/migrations" ]; then
    echo "📂 Using existing PostgreSQL migrations..."
    rm -rf /app/prisma/migrations
    mv /app/prisma/migrations-postgres /app/prisma/migrations
fi

# Run Prisma migrations with validation
echo "🔄 Running Prisma migrations..."

# Check if migrations directory exists
if [ -d "/app/prisma/migrations" ]; then
    echo "📁 Found migration files, running Prisma migrate deploy..."
    npx prisma migrate deploy
    
    # Validate migration status
    if [ \$? -eq 0 ]; then
        echo "✅ Migrations applied successfully"
        
        # Verify database schema
        npx prisma migrate status
    else
        echo "❌ Migration failed, falling back to db push..."
        npx prisma db push --force-reset
    fi
else
    echo "📝 No migration files found, using db push..."
    npx prisma db push
fi

# Generate Prisma client for runtime
echo "🔧 Generating Prisma client..."
npx prisma generate

# Create admin user
echo "👤 Creating admin user..."
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    const prisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } }
    });
    
    try {
        const hashedPassword = await bcrypt.hash('Admin123!', 12);
        
        await prisma.user.upsert({
            where: { email: 'admin@videomix.pro' },
            update: {
                credits: 1000,
                licenseType: 'ENTERPRISE',
                role: 'ADMIN'
            },
            create: {
                email: 'admin@videomix.pro',
                password: hashedPassword,
                firstName: 'Admin',
                lastName: 'User',
                credits: 1000,
                licenseType: 'ENTERPRISE',
                role: 'ADMIN'
            }
        });
        
        console.log('✅ Admin user created/updated successfully');
        console.log('📧 Email: admin@videomix.pro');
        console.log('🔑 Password: Admin123!');
        console.log('💳 Credits: 1000');
        console.log('👤 Role: ADMIN');
        
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        process.exit(1);
    } finally {
        await prisma.\$disconnect();
    }
}

createAdmin();
"

echo "🎉 Database initialization complete!"
EOF

# Make init script executable
RUN chmod +x /app/init-db.sh

# Set environment variables for production (will be overridden by docker run)
ENV NODE_ENV=production
ENV PORT=3002
ENV DATABASE_PROVIDER="postgresql"
ENV DOCKER_ENV="true"
ENV JWT_SECRET="production-jwt-secret-change-this"
ENV FRONTEND_URL="http://localhost:3000"

# Create supervisor log directory and set permissions
RUN mkdir -p /var/log/supervisor && \
    chown -R appuser:appgroup /app && \
    chown -R appuser:appgroup /var/log/nginx && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /run/nginx && \
    chown -R appuser:appgroup /var/log/supervisor

# Expose port (nginx will serve on 3000, backend on 3002)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Create startup script
COPY <<EOF /app/start.sh
#!/bin/bash
set -e

echo "🚀 Starting VideoMixPro with external PostgreSQL..."

# Initialize database with external PostgreSQL
/app/init-db.sh

# Start supervisor to manage backend and nginx
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
EOF

RUN chmod +x /app/start.sh

# Start services
CMD ["/app/start.sh"]