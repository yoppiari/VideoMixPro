const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Video Mixer Pro - Development Setup\n');
console.log('This script will set up your local development environment.\n');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkNodeVersion() {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.split('.')[0].substring(1));

  if (major < 16) {
    log('❌ Node.js version 16 or higher is required', 'red');
    log(`   Current version: ${nodeVersion}`, 'yellow');
    process.exit(1);
  }

  log(`✅ Node.js ${nodeVersion}`, 'green');
}

function setupEnvironment() {
  log('\n📝 Setting up environment files...', 'blue');

  const envDevPath = path.join(process.cwd(), '.env.development');
  const envPath = path.join(process.cwd(), '.env');

  // Check if .env.development exists
  if (!fs.existsSync(envDevPath)) {
    log('   Creating .env.development file...', 'yellow');
    const envTemplate = `# Development Environment Configuration
NODE_ENV=development
PORT=3000

# SQLite for development
DATABASE_URL_DEV="file:./dev.db"
DATABASE_PROVIDER="sqlite"

# PostgreSQL for production (not used in dev)
DATABASE_URL="postgresql://postgres:password@localhost:5432/videomixpro?schema=public"

# In-memory queue for development
USE_IN_MEMORY_QUEUE=true
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="dev-jwt-secret-key-change-in-production"
JWT_EXPIRES_IN="24h"

# Storage
USE_LOCAL_STORAGE=true
UPLOAD_DIR="./uploads"
OUTPUT_DIR="./outputs"

# FFmpeg (update paths after running npm run setup:ffmpeg)
FFMPEG_PATH="ffmpeg"
FFPROBE_PATH="ffprobe"

# Application
FRONTEND_URL="http://localhost:3001"
API_VERSION="v1"
MAX_FILE_SIZE=500MB
ALLOWED_VIDEO_FORMATS="mp4,mov,avi,mkv"

# Development flags
SKIP_LICENSE_CHECK=true
LOG_LEVEL="debug"
LOG_TO_FILE=true
LOG_DIR="./logs"
`;
    fs.writeFileSync(envDevPath, envTemplate);
    log('   ✅ .env.development created', 'green');
  } else {
    log('   ✅ .env.development already exists', 'green');
  }

  // Copy .env.development to .env if .env doesn't exist
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(envDevPath, envPath);
    log('   ✅ .env created from .env.development', 'green');
  }
}

function createDirectories() {
  log('\n📁 Creating required directories...', 'blue');

  const dirs = ['uploads', 'outputs', 'logs', 'prisma/migrations'];

  dirs.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      log(`   ✅ Created ${dir}/`, 'green');
    } else {
      log(`   ✓ ${dir}/ already exists`, 'yellow');
    }
  });
}

function installDependencies() {
  log('\n📦 Checking npm dependencies...', 'blue');

  try {
    // Check if node_modules exists
    if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
      log('   Installing dependencies...', 'yellow');
      execSync('npm install', { stdio: 'inherit' });
    } else {
      log('   ✅ Dependencies already installed', 'green');
    }
  } catch (error) {
    log('   ❌ Failed to install dependencies', 'red');
    console.error(error.message);
    process.exit(1);
  }
}

function setupDatabase() {
  log('\n🗄️ Setting up SQLite database...', 'blue');

  try {
    // Generate Prisma client for development
    log('   Generating Prisma client...', 'yellow');
    execSync('npm run db:dev:generate', { stdio: 'inherit' });
    log('   ✅ Prisma client generated', 'green');

    // Run migrations
    log('   Running database migrations...', 'yellow');
    execSync('npm run db:dev:migrate -- --name init', { stdio: 'inherit' });
    log('   ✅ Database migrations completed', 'green');

  } catch (error) {
    log('   ⚠️ Database setup encountered issues', 'yellow');
    log('   You may need to run migrations manually:', 'yellow');
    log('   npm run db:dev:migrate', 'yellow');
  }
}

function checkFFmpeg() {
  log('\n🎬 Checking FFmpeg...', 'blue');

  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    log('   ✅ FFmpeg is installed', 'green');
  } catch {
    log('   ⚠️ FFmpeg not found', 'yellow');
    log('   Run: npm run setup:ffmpeg', 'yellow');
    log('   Or download manually from: https://ffmpeg.org/download.html', 'yellow');
  }
}

function printNextSteps() {
  log('\n' + '='.repeat(60), 'blue');
  log('✨ Setup Complete!', 'green');
  log('='.repeat(60), 'blue');

  log('\n📋 Next Steps:', 'blue');
  log('1. If FFmpeg is not installed:', 'yellow');
  log('   npm run setup:ffmpeg', 'reset');

  log('\n2. Start the development server:', 'yellow');
  log('   npm run dev', 'reset');

  log('\n3. In another terminal, start the worker:', 'yellow');
  log('   npm run queue:dev', 'reset');

  log('\n4. Open Prisma Studio to view database:', 'yellow');
  log('   npm run db:dev:studio', 'reset');

  log('\n📚 Documentation:', 'blue');
  log('   - API Documentation: docs/api.md');
  log('   - Architecture: docs/architecture.md');
  log('   - Database Schema: docs/database.md');

  log('\n🌐 Production Deployment:', 'blue');
  log('   When ready to deploy, the app will automatically use:');
  log('   - PostgreSQL instead of SQLite');
  log('   - Redis instead of in-memory queue');
  log('   - Cloud storage instead of local files');
  log('   Just set NODE_ENV=production and configure .env');

  log('\n💡 Tips:', 'blue');
  log('   - This setup is optimized for low-spec development');
  log('   - No Docker required!');
  log('   - SQLite database is in prisma/dev.db');
  log('   - All jobs run in memory (no Redis needed)');

  log('\n🚀 Happy coding!\n', 'green');
}

async function main() {
  try {
    checkNodeVersion();
    setupEnvironment();
    createDirectories();
    installDependencies();
    setupDatabase();
    checkFFmpeg();
    printNextSteps();
  } catch (error) {
    log(`\n❌ Setup failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run setup
main();