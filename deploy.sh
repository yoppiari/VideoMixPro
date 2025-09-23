#!/bin/bash

# VideoMixPro Deployment Script with External PostgreSQL
# This script builds and runs the unified Docker container with external PostgreSQL database

set -e

echo "🚀 VideoMixPro Deployment with External PostgreSQL"
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# External PostgreSQL configuration
EXTERNAL_DB_URL="postgres://postgres:6LP0Ojegy7IUU6kaX9lLkmZRUiAdAUNOltWyL3LegfYGR6rPQtB4DUSVqjdA78ES@107.155.75.50:5986/videomix"

# Build the unified image
echo "📦 Building unified Docker image for external PostgreSQL..."
docker build -t videomixpro:latest .

# Stop existing container if running
echo "🛑 Stopping existing container..."
docker stop videomixpro 2>/dev/null || true
docker rm videomixpro 2>/dev/null || true

# Set default environment variables
export JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 32)}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

# Test external database connection
echo "🔍 Testing external PostgreSQL connection..."
if command -v psql > /dev/null 2>&1; then
    # Extract connection details for testing
    DB_HOST="107.155.75.50"
    DB_PORT="5986"
    DB_USER="postgres"
    DB_NAME="videomix"
    
    echo "📡 Connecting to $DB_HOST:$DB_PORT as $DB_USER..."
    if timeout 10 bash -c "</dev/tcp/$DB_HOST/$DB_PORT" 2>/dev/null; then
        echo "✅ External PostgreSQL is accessible"
    else
        echo "⚠️ Warning: Cannot reach external PostgreSQL at $DB_HOST:$DB_PORT"
        echo "   The container will still start and retry the connection"
    fi
else
    echo "ℹ️ psql not available locally, will test connection from container"
fi

# Run the new container with external PostgreSQL
echo "🏃 Starting VideoMixPro container with external PostgreSQL..."
docker run -d \
    --name videomixpro \
    -p 3000:3000 \
    -v videomixpro_uploads:/app/uploads \
    -v videomixpro_outputs:/app/outputs \
    -v videomixpro_logs:/app/logs \
    -v videomixpro_backups:/app/backups \
    -e NODE_ENV=production \
    -e JWT_SECRET="${JWT_SECRET}" \
    -e FRONTEND_URL="${FRONTEND_URL}" \
    -e DATABASE_URL="${EXTERNAL_DB_URL}" \
    -e DATABASE_PROVIDER="postgresql" \
    --restart unless-stopped \
    videomixpro:latest

echo "⏳ Waiting for container to start up and connect to external database..."
sleep 15

# Check if container is running
if docker ps | grep -q videomixpro; then
    echo "✅ VideoMixPro is now running with external PostgreSQL!"
    echo ""
    echo "🌐 Access the application at: ${FRONTEND_URL}"
    echo "🔐 Default admin credentials:"
    echo "   Email: admin@videomix.pro"
    echo "   Password: Admin123!"
    echo ""
    echo "🗄️ Database: External PostgreSQL"
    echo "📡 Database Host: 107.155.75.50:5986"
    echo "🔑 JWT Secret: ${JWT_SECRET}"
    echo ""
    echo "📋 Useful commands:"
    echo "   View logs: docker logs -f videomixpro"
    echo "   Database status: docker exec videomixpro /app/scripts/migrate.sh status"
    echo "   Migration logs: docker logs videomixpro | grep -E '(Migration|Database|Prisma)'"
    echo "   Backend logs: docker exec videomixpro tail -f /var/log/supervisor/backend_stdout.log"
    echo "   Stop: docker stop videomixpro"
    echo "   Restart: docker restart videomixpro"
    echo "   Remove: docker rm -f videomixpro"
    echo ""
    echo "💾 Data Volumes (persistent):"
    echo "   - videomixpro_uploads (uploaded videos)"
    echo "   - videomixpro_outputs (processed videos)" 
    echo "   - videomixpro_logs (application logs)"
    echo "   - videomixpro_backups (database backups)"
    echo "   - Database data stored in external PostgreSQL"
    echo ""
    echo "🔍 Container startup logs:"
    docker logs videomixpro --tail 20
else
    echo "❌ Failed to start container. Check logs:"
    docker logs videomixpro
    exit 1
fi