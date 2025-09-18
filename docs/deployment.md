# Deployment Guide

## Overview

This guide covers deploying Video Mixer Pro from local development to production environments. The application supports multiple deployment strategies from simple VPS to enterprise Kubernetes clusters.

## Prerequisites

### System Requirements

**Minimum Production Requirements:**
- **CPU**: 4 cores (8+ recommended for video processing)
- **RAM**: 8GB (16GB+ recommended)
- **Storage**: 100GB SSD (500GB+ recommended)
- **Network**: 1Gbps connection
- **OS**: Ubuntu 20.04+ / CentOS 8+ / Amazon Linux 2

**Dependencies:**
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- FFmpeg 4.4+
- Docker & Docker Compose (for containerized deployment)

### External Services

- **Domain & SSL Certificate** (Let's Encrypt or commercial)
- **Email Service** (SendGrid, Amazon SES, etc.)
- **Cloud Storage** (AWS S3, Google Cloud Storage)
- **Payment Gateway** (Stripe, PayPal)
- **Monitoring** (Optional: New Relic, Datadog)

## Environment Configuration

### Environment Variables

Create production environment file:

```bash
# Production .env
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL="postgresql://videomixpro:${DB_PASSWORD}@db.example.com:5432/videomixpro_prod"

# Redis
REDIS_URL="redis://:${REDIS_PASSWORD}@redis.example.com:6379"

# JWT Configuration
JWT_SECRET="${SECURE_JWT_SECRET}"
JWT_EXPIRES_IN="24h"

# File Storage
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_KEY}"
AWS_REGION="us-east-1"
AWS_S3_BUCKET="videomixpro-production"

# FFmpeg
FFMPEG_PATH="/usr/bin/ffmpeg"
FFPROBE_PATH="/usr/bin/ffprobe"

# Application
FRONTEND_URL="https://app.videomixpro.com"
API_VERSION="v1"
MAX_FILE_SIZE="500MB"

# Monitoring
LOG_LEVEL="info"
SENTRY_DSN="${SENTRY_DSN}"

# Email
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT="587"
SMTP_USER="${SENDGRID_USER}"
SMTP_PASSWORD="${SENDGRID_PASSWORD}"

# Payment
STRIPE_SECRET_KEY="${STRIPE_SECRET}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET}"

# Security
CORS_ORIGINS="https://videomixpro.com,https://app.videomixpro.com"
RATE_LIMIT_WINDOW="900000"  # 15 minutes
RATE_LIMIT_MAX="1000"       # 1000 requests per window
```

### Secrets Management

**Using AWS Secrets Manager:**
```bash
# Store secrets
aws secretsmanager create-secret \
    --name "videomixpro/production" \
    --description "Production secrets for Video Mixer Pro" \
    --secret-string '{
        "DATABASE_URL": "postgresql://...",
        "JWT_SECRET": "...",
        "STRIPE_SECRET_KEY": "..."
    }'

# Retrieve in deployment script
SECRETS=$(aws secretsmanager get-secret-value \
    --secret-id "videomixpro/production" \
    --query SecretString --output text)
```

**Using Docker Secrets:**
```bash
# Create secrets
echo "super-secure-jwt-secret" | docker secret create jwt_secret -
echo "postgresql://..." | docker secret create database_url -

# Use in docker-compose.yml
services:
  api:
    secrets:
      - jwt_secret
      - database_url
```

## Deployment Strategies

### 1. Simple VPS Deployment

#### Using PM2 Process Manager

**Install Dependencies:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Install Redis
sudo apt install redis-server

# Install FFmpeg
sudo apt install ffmpeg

# Install PM2
sudo npm install -g pm2
```

**Application Setup:**
```bash
# Clone repository
git clone https://github.com/your-org/videomixpro.git
cd videomixpro

# Install dependencies
npm ci --only=production

# Build application
npm run build

# Setup database
npm run db:migrate

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**PM2 Configuration (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [
    {
      name: 'videomixpro-api',
      script: 'dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/videomixpro/error.log',
      out_file: '/var/log/videomixpro/out.log',
      log_file: '/var/log/videomixpro/combined.log'
    },
    {
      name: 'videomixpro-worker',
      script: 'dist/workers/index.js',
      instances: 2,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

**Nginx Configuration:**
```nginx
# /etc/nginx/sites-available/videomixpro
server {
    listen 80;
    server_name api.videomixpro.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.videomixpro.com;

    ssl_certificate /etc/letsencrypt/live/api.videomixpro.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.videomixpro.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # File upload limits
    client_max_body_size 500M;

    # API proxy
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://localhost:3000/health;
    }
}
```

### 2. Docker Deployment

#### Production Docker Setup

**Dockerfile.production:**
```dockerfile
# Multi-stage build for production
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install FFmpeg and other runtime dependencies
RUN apk add --no-cache ffmpeg

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy Prisma schema for migrations
COPY prisma ./prisma

# Create necessary directories
RUN mkdir -p uploads outputs logs
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["npm", "start"]
```

**Docker Compose Production:**
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.production
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://videomixpro:${DB_PASSWORD}@postgres:5432/videomixpro
      REDIS_URL: redis://redis:6379
    volumes:
      - uploads_data:/app/uploads
      - outputs_data:/app/outputs
      - logs_data:/app/logs
    depends_on:
      - postgres
      - redis
    networks:
      - videomixpro_network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.videomixpro.com`)"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"

  worker:
    build:
      context: .
      dockerfile: Dockerfile.production
    restart: unless-stopped
    command: npm run queue:start
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://videomixpro:${DB_PASSWORD}@postgres:5432/videomixpro
      REDIS_URL: redis://redis:6379
    volumes:
      - uploads_data:/app/uploads
      - outputs_data:/app/outputs
      - logs_data:/app/logs
    depends_on:
      - postgres
      - redis
    networks:
      - videomixpro_network
    deploy:
      replicas: 2

  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: videomixpro
      POSTGRES_USER: videomixpro
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    networks:
      - videomixpro_network
    command: postgres -c 'max_connections=200' -c 'shared_buffers=256MB'

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - videomixpro_network
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru

  traefik:
    image: traefik:v2.10
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/traefik.yml:ro
      - ./acme.json:/acme.json
      - logs_data:/logs
    networks:
      - videomixpro_network

volumes:
  postgres_data:
  redis_data:
  uploads_data:
  outputs_data:
  logs_data:

networks:
  videomixpro_network:
    driver: bridge
```

#### Deployment Script

**deploy.sh:**
```bash
#!/bin/bash

set -e

echo "🚀 Starting Video Mixer Pro deployment..."

# Load environment variables
source .env.production

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Build and deploy
echo "🔨 Building and deploying containers..."
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose -f docker-compose.prod.yml exec api npm run db:migrate

# Health check
echo "🏥 Performing health check..."
sleep 10
if curl -f http://localhost/health; then
    echo "✅ Deployment successful!"
else
    echo "❌ Deployment failed - health check failed"
    exit 1
fi

# Cleanup old images
echo "🧹 Cleaning up old images..."
docker system prune -f

echo "🎉 Deployment completed successfully!"
```

### 3. Kubernetes Deployment

#### Kubernetes Manifests

**namespace.yaml:**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: videomixpro
  labels:
    name: videomixpro
```

**configmap.yaml:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: videomixpro-config
  namespace: videomixpro
data:
  NODE_ENV: "production"
  PORT: "3000"
  API_VERSION: "v1"
  LOG_LEVEL: "info"
  FFMPEG_PATH: "/usr/bin/ffmpeg"
  FFPROBE_PATH: "/usr/bin/ffprobe"
```

**secrets.yaml:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: videomixpro-secrets
  namespace: videomixpro
type: Opaque
data:
  DATABASE_URL: <base64-encoded-database-url>
  JWT_SECRET: <base64-encoded-jwt-secret>
  REDIS_URL: <base64-encoded-redis-url>
  AWS_ACCESS_KEY_ID: <base64-encoded-aws-key>
  AWS_SECRET_ACCESS_KEY: <base64-encoded-aws-secret>
```

**api-deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: videomixpro-api
  namespace: videomixpro
  labels:
    app: videomixpro-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: videomixpro-api
  template:
    metadata:
      labels:
        app: videomixpro-api
    spec:
      containers:
      - name: api
        image: videomixpro:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: videomixpro-config
        - secretRef:
            name: videomixpro-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: uploads-storage
          mountPath: /app/uploads
        - name: outputs-storage
          mountPath: /app/outputs
      volumes:
      - name: uploads-storage
        persistentVolumeClaim:
          claimName: uploads-pvc
      - name: outputs-storage
        persistentVolumeClaim:
          claimName: outputs-pvc
```

**worker-deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: videomixpro-worker
  namespace: videomixpro
  labels:
    app: videomixpro-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: videomixpro-worker
  template:
    metadata:
      labels:
        app: videomixpro-worker
    spec:
      containers:
      - name: worker
        image: videomixpro:latest
        command: ["npm", "run", "queue:start"]
        envFrom:
        - configMapRef:
            name: videomixpro-config
        - secretRef:
            name: videomixpro-secrets
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        volumeMounts:
        - name: uploads-storage
          mountPath: /app/uploads
        - name: outputs-storage
          mountPath: /app/outputs
      volumes:
      - name: uploads-storage
        persistentVolumeClaim:
          claimName: uploads-pvc
      - name: outputs-storage
        persistentVolumeClaim:
          claimName: outputs-pvc
```

**service.yaml:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: videomixpro-api-service
  namespace: videomixpro
spec:
  selector:
    app: videomixpro-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

**ingress.yaml:**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: videomixpro-ingress
  namespace: videomixpro
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: 500m
spec:
  tls:
  - hosts:
    - api.videomixpro.com
    secretName: videomixpro-tls
  rules:
  - host: api.videomixpro.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: videomixpro-api-service
            port:
              number: 80
```

#### Deployment Commands

```bash
# Apply all manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n videomixpro
kubectl get services -n videomixpro
kubectl get ingress -n videomixpro

# View logs
kubectl logs -f deployment/videomixpro-api -n videomixpro
kubectl logs -f deployment/videomixpro-worker -n videomixpro

# Scale deployment
kubectl scale deployment videomixpro-api --replicas=5 -n videomixpro
```

## Database Management

### Migration Strategy

**Production Migration Script:**
```bash
#!/bin/bash

echo "🗄️ Starting database migration..."

# Backup current database
pg_dump $DATABASE_URL > "backup_$(date +%Y%m%d_%H%M%S).sql"

# Run migrations
npm run db:migrate

# Verify migration
npm run db:status

echo "✅ Database migration completed!"
```

### Backup & Recovery

**Automated Backup Script:**
```bash
#!/bin/bash

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/videomixpro_$TIMESTAMP.sql"

# Create backup
pg_dump $DATABASE_URL > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Upload to S3
aws s3 cp "$BACKUP_FILE.gz" s3://videomixpro-backups/

# Clean old local backups (keep last 7 days)
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "✅ Backup completed: $BACKUP_FILE.gz"
```

**Cron Job Setup:**
```bash
# Add to crontab
0 2 * * * /opt/videomixpro/scripts/backup.sh >> /var/log/videomixpro/backup.log 2>&1
```

## Monitoring & Logging

### Application Monitoring

**Prometheus Configuration:**
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'videomixpro-api'
    static_configs:
      - targets: ['api.videomixpro.com:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
```

**Grafana Dashboard:**
```json
{
  "dashboard": {
    "title": "Video Mixer Pro Monitoring",
    "panels": [
      {
        "title": "API Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, http_request_duration_seconds_bucket{job=\"videomixpro-api\"})"
          }
        ]
      },
      {
        "title": "Active Processing Jobs",
        "type": "stat",
        "targets": [
          {
            "expr": "processing_jobs_active{status=\"PROCESSING\"}"
          }
        ]
      }
    ]
  }
}
```

### Log Management

**Centralized Logging with ELK Stack:**
```yaml
# docker-compose.logging.yml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.17.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:7.17.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:7.17.0
    ports:
      - "5601:5601"
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    depends_on:
      - elasticsearch

volumes:
  elasticsearch_data:
```

## Security Hardening

### SSL/TLS Configuration

**Let's Encrypt with Certbot:**
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d api.videomixpro.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Firewall Configuration

```bash
# UFW configuration
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny from any to any port 5432  # Block direct DB access
sudo ufw deny from any to any port 6379  # Block direct Redis access
```

### Security Headers

```nginx
# Additional security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()";
```

## Performance Optimization

### Database Optimization

```sql
-- Production database settings
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;

-- Restart PostgreSQL to apply changes
```

### CDN Configuration

**CloudFront Distribution:**
```json
{
  "DistributionConfig": {
    "Origins": [{
      "DomainName": "api.videomixpro.com",
      "Id": "videomixpro-api",
      "CustomOriginConfig": {
        "HTTPPort": 443,
        "OriginProtocolPolicy": "https-only"
      }
    }],
    "DefaultCacheBehavior": {
      "TargetOriginId": "videomixpro-api",
      "ViewerProtocolPolicy": "redirect-to-https",
      "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
      "CompressResult": true
    },
    "Comment": "Video Mixer Pro API CDN",
    "Enabled": true
  }
}
```

## Disaster Recovery

### Backup Strategy

1. **Database**: Daily automated backups with 30-day retention
2. **File Storage**: S3 cross-region replication
3. **Application Code**: Git repository with multiple remotes
4. **Configuration**: Infrastructure as Code with Terraform

### Recovery Procedures

**Database Recovery:**
```bash
# Restore from backup
gunzip backup_20240115_020000.sql.gz
psql $DATABASE_URL < backup_20240115_020000.sql

# Verify data integrity
npm run db:status
npm run test:integration
```

**Complete System Recovery:**
```bash
# 1. Provision infrastructure
terraform apply

# 2. Deploy application
./deploy.sh

# 3. Restore database
./restore-database.sh backup_20240115_020000.sql.gz

# 4. Verify system health
./health-check.sh
```

This deployment guide provides comprehensive coverage for deploying Video Mixer Pro in various environments while maintaining security, performance, and reliability standards.