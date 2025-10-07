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

# Cache busting argument - change this to force rebuild
ARG CACHE_BUST=2025-10-07-08-42-debug-logging

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy backend package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy backend source
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client for PostgreSQL
ENV DATABASE_PROVIDER="postgresql"
ENV DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder"
RUN npx prisma generate

# Build TypeScript to JavaScript
RUN npm run build

# Stage 3: Production Runtime (External PostgreSQL)
FROM node:18-alpine AS production

# Install system dependencies (no PostgreSQL - using external)
RUN apk add --no-cache \
    ffmpeg \
    nginx \
    supervisor \
    curl \
    bash \
    netcat-openbsd \
    postgresql-client

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
    /run/nginx \
    /var/lib/nginx/logs \
    /var/lib/nginx/tmp/client_body \
    /var/lib/nginx/tmp/proxy \
    /var/lib/nginx/tmp/fastcgi \
    /var/lib/nginx/tmp/uwsgi \
    /var/lib/nginx/tmp/scgi

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

    # Allow large video uploads
    client_max_body_size 500M;
    client_body_timeout 300s;
    client_body_buffer_size 128k;

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
        
        # API proxy to backend - preserve full path
        location /api/ {
            proxy_pass http://localhost:3002/api/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;

            # Timeouts for large uploads
            proxy_connect_timeout 300s;
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;

            # Buffering for large requests
            proxy_request_buffering off;
            proxy_buffering off;
        }
        
        # Health check endpoint
        location /health {
            proxy_pass http://localhost:3002/health;
        }

        # Debug endpoint
        location /debug-env {
            proxy_pass http://localhost:3002/debug-env;
        }

        # Debug login endpoint
        location /debug-login {
            proxy_pass http://localhost:3002/debug-login;
        }

        # Emergency login endpoint
        location /emergency-login {
            proxy_pass http://localhost:3002/emergency-login;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        }

        # React Router - serve index.html for all routes
        location / {
            try_files \$uri \$uri/ /index.html;
        }
    }
}
EOF

# Copy supervisor configuration (improved)
COPY <<EOF /etc/supervisor/conf.d/supervisord.conf
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisor/supervisord.pid

[program:backend]
command=node -r module-alias/register dist/index.js
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
priority=999
EOF

# Create database initialization script for external PostgreSQL (simplified)
COPY <<EOF /app/init-db.sh
#!/bin/bash
set -e

echo "🚀 Initializing VideoMixPro Database..."

# 1. Validate environment
if [ -z "\$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set"
    exit 1
fi

# Force PostgreSQL for production
export DATABASE_PROVIDER="postgresql"
export DOCKER_ENV="true"

# 2. Wait for database (with timeout) - SKIP FOR NOW
echo "⏳ Skipping database wait (will try Prisma connect)..."
# Database wait disabled temporarily to bypass timeout issue
# The application will handle connection retries via Prisma

# 3. Generate schema
echo "📝 Generating schema..."
node /app/scripts/generate-schema.js
npx prisma generate

# 4. Copy PostgreSQL migrations
if [ -d "/app/prisma/migrations-postgres" ] && [ ! -d "/app/prisma/migrations" ]; then
    echo "📂 Activating PostgreSQL migrations..."
    cp -r /app/prisma/migrations-postgres /app/prisma/migrations
fi

# 5. Apply migrations (safe)
echo "🔄 Applying migrations..."
if npx prisma migrate deploy 2>&1; then
    echo "✅ Migrations applied"
else
    echo "⚠️  Migrate failed, using db push..."
    npx prisma db push --skip-generate
fi

# 6. Create admin (idempotent)
echo "👤 Creating admin..."
node /app/scripts/create-admin.js

echo "✅ Database ready"
EOF

# Make init script executable
RUN chmod +x /app/init-db.sh

# Set environment variables for production (will be overridden by docker run)
ENV NODE_ENV=production
ENV PORT=3002
ENV DATABASE_PROVIDER="postgresql"
ENV DOCKER_ENV="true"
ENV JWT_SECRET="videomixpro-production-jwt-secret-2024-lumiku-secure-key-change-in-production"
ENV FRONTEND_URL="https://private.lumiku.com"
ENV USE_IN_MEMORY_QUEUE=true
ENV REDIS_URL="redis://localhost:6379"
ENV MAX_FILE_SIZE=524288000
ENV UPLOAD_PATH=/app/uploads
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Create supervisor log directory and set permissions
RUN mkdir -p /var/log/supervisor /var/run/supervisor && \
    chown -R appuser:appgroup /app && \
    chown -R appuser:appgroup /var/log/nginx && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /run/nginx && \
    chown -R appuser:appgroup /var/log/supervisor && \
    chown -R appuser:appgroup /var/run/supervisor && \
    chown -R appuser:appgroup /var/lib/nginx

# Define volumes for persistent data
VOLUME ["/app/uploads", "/app/outputs", "/app/logs"]

# Expose port (nginx will serve on 3000, backend on 3002)
EXPOSE 3000

# Improved healthcheck - reduced start period with better retry
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:3000/health || exit 1

# Create startup script (improved)
COPY <<EOF /app/start.sh
#!/bin/bash
set -e

echo "🚀 Starting VideoMixPro..."

# Initialize database (with better error handling)
if /app/init-db.sh; then
    echo "✅ Database initialized successfully"
else
    echo "❌ Database initialization failed"
    echo "📋 Last 50 lines of logs:"
    tail -n 50 /var/log/supervisor/*.log 2>/dev/null || echo "No logs available"
    exit 1
fi

# Start services
echo "🔄 Starting services (backend + nginx)..."
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
EOF

RUN chmod +x /app/start.sh

# Start services
CMD ["/app/start.sh"]