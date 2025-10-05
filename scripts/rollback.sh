#!/bin/bash

# VideoMixPro Emergency Rollback Script
# Use this script to quickly rollback to previous version

set -e

echo "🆘 VideoMixPro Emergency Rollback"
echo "=================================="
echo ""

# Check if we have a backup image
BACKUP_IMAGE=$(docker images videomixpro:backup -q)

if [ -z "$BACKUP_IMAGE" ]; then
    echo "⚠️  No backup image found (videomixpro:backup)"
    echo ""
    echo "Available images:"
    docker images | grep videomixpro || echo "No videomixpro images found"
    echo ""
    echo "Manual rollback options:"
    echo "  1. Rebuild from previous Git commit"
    echo "  2. Use Coolify's rollback feature"
    echo "  3. Restore from Docker registry (if pushed)"
    exit 1
fi

echo "📦 Found backup image: $BACKUP_IMAGE"
echo ""

# Ask for confirmation
read -p "⚠️  This will stop current container and restore backup. Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Rollback cancelled"
    exit 0
fi

echo ""
echo "🛑 Stopping current container..."
docker stop videomixpro 2>/dev/null || true
docker rm videomixpro 2>/dev/null || true

echo "✅ Container stopped"
echo ""

echo "🔄 Restoring backup image..."
docker tag videomixpro:backup videomixpro:latest

echo "✅ Backup restored"
echo ""

echo "🚀 Starting container with backup image..."
# Note: Adjust environment variables as needed
docker run -d \
    --name videomixpro \
    -p 3000:3000 \
    -e DATABASE_URL="$DATABASE_URL" \
    -e DATABASE_PROVIDER="postgresql" \
    -e NODE_ENV="production" \
    videomixpro:latest

echo "✅ Container started"
echo ""

echo "⏳ Waiting for health check..."
sleep 10

# Check if container is running
if docker ps | grep -q videomixpro; then
    echo "✅ Rollback successful!"
    echo ""
    echo "📋 Container status:"
    docker ps | grep videomixpro
else
    echo "❌ Container not running. Check logs:"
    docker logs videomixpro
    exit 1
fi
