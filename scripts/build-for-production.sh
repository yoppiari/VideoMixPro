#!/bin/bash

# VideoMixPro Production Build Script
# This script runs all pre-deployment checks and builds Docker image

set -e

echo "🏗️  VideoMixPro Production Build"
echo "================================="
echo ""

# Step 1: Pre-deployment validation
echo "📋 Step 1: Running pre-deployment checks..."
node scripts/pre-deploy-check.js

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Pre-deployment checks failed!"
    echo "   Please fix the issues above before building."
    exit 1
fi

echo ""
echo "✅ All checks passed!"
echo ""

# Step 2: Clean previous builds
echo "🧹 Step 2: Cleaning previous builds..."
rm -rf dist/ frontend/build/ 2>/dev/null || true
echo "✅ Clean complete"
echo ""

# Step 3: Build backend
echo "🔨 Step 3: Building backend TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Backend build failed!"
    exit 1
fi

echo "✅ Backend built successfully"
echo ""

# Step 4: Build frontend
echo "🎨 Step 4: Building frontend React app..."
cd frontend
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed!"
    exit 1
fi

cd ..
echo "✅ Frontend built successfully"
echo ""

# Step 5: Build Docker image
echo "🐳 Step 5: Building Docker image..."
docker build -t videomixpro:latest .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed!"
    exit 1
fi

echo "✅ Docker image built successfully"
echo ""

# Step 6: Show image info
echo "📦 Docker Image Info:"
docker images videomixpro:latest
echo ""

# Success summary
echo "================================="
echo "✅ BUILD COMPLETE!"
echo "================================="
echo ""
echo "🎉 Production build ready for deployment"
echo ""
echo "📋 Next steps:"
echo "   1. Test locally: docker run -d -p 3000:3000 --env-file .env.production videomixpro:latest"
echo "   2. Push to Git: git add . && git commit -m 'Production ready' && git push"
echo "   3. Let Coolify rebuild automatically"
echo ""
echo "🆘 If issues occur:"
echo "   - Check logs: docker logs <container_id>"
echo "   - Rollback: ./scripts/rollback.sh"
echo ""
