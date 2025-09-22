#!/usr/bin/env node

/**
 * Database Configuration Validator
 * Ensures SQLite is properly configured for development
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateEnvironment() {
  log('\n🔍 Validating Database Configuration...', 'cyan');

  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    log('❌ .env file not found!', 'red');
    log('   Please copy .env.example to .env and configure it.', 'yellow');
    return false;
  }

  // Read .env file
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      if (key && value) {
        // Remove quotes and inline comments
        let cleanValue = value.trim().replace(/"/g, '');
        // Remove inline comments (e.g., # comment)
        const commentIndex = cleanValue.indexOf('#');
        if (commentIndex > 0) {
          cleanValue = cleanValue.substring(0, commentIndex).trim();
        }
        envVars[key.trim()] = cleanValue;
      }
    }
  });

  // Check NODE_ENV
  const nodeEnv = envVars.NODE_ENV || process.env.NODE_ENV || 'development';
  log(`\n📦 Environment: ${nodeEnv}`, 'blue');

  if (nodeEnv === 'development') {
    // Validate SQLite configuration
    log('\n🗄️  Database Type: SQLite (Development)', 'green');

    // Check DATABASE_URL
    if (!envVars.DATABASE_URL) {
      log('❌ DATABASE_URL not set!', 'red');
      log('   Add: DATABASE_URL="file:./prisma/dev.db"', 'yellow');
      return false;
    }

    if (!envVars.DATABASE_URL.startsWith('file:')) {
      log('⚠️  Warning: DATABASE_URL should start with "file:" for SQLite', 'yellow');
      log(`   Current: ${envVars.DATABASE_URL}`, 'yellow');
      log('   Expected: file:./prisma/dev.db', 'green');
    } else {
      log(`✅ DATABASE_URL configured: ${envVars.DATABASE_URL}`, 'green');
    }

    // Check if database file exists
    const dbPath = envVars.DATABASE_URL.replace('file:', '');
    const absoluteDbPath = path.isAbsolute(dbPath)
      ? dbPath
      : path.join(process.cwd(), dbPath);

    if (fs.existsSync(absoluteDbPath)) {
      const stats = fs.statSync(absoluteDbPath);
      log(`✅ Database file exists: ${absoluteDbPath}`, 'green');
      log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`, 'cyan');
    } else {
      log(`⚠️  Database file not found: ${absoluteDbPath}`, 'yellow');
      log('   Run "npm run db:setup" to create it.', 'yellow');
    }

    // Check DATABASE_PROVIDER
    if (envVars.DATABASE_PROVIDER !== 'sqlite') {
      log('⚠️  DATABASE_PROVIDER should be "sqlite" for development', 'yellow');
    } else {
      log('✅ DATABASE_PROVIDER correctly set to sqlite', 'green');
    }

  } else if (nodeEnv === 'production') {
    log('\n🗄️  Database Type: PostgreSQL (Production)', 'blue');

    if (!envVars.DATABASE_URL_PROD && !envVars.DATABASE_URL) {
      log('❌ Production database URL not configured!', 'red');
      return false;
    }

    const prodUrl = envVars.DATABASE_URL_PROD || envVars.DATABASE_URL;
    if (prodUrl && prodUrl.startsWith('postgresql://')) {
      log('✅ PostgreSQL URL configured', 'green');
    } else {
      log('❌ Invalid PostgreSQL URL', 'red');
      return false;
    }
  }

  // Check Prisma schema
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    log('\n❌ Prisma schema not found!', 'red');
    return false;
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  if (schemaContent.includes('provider = "sqlite"')) {
    log('\n✅ Prisma schema configured for SQLite', 'green');
  } else if (schemaContent.includes('provider = "postgresql"')) {
    log('\n✅ Prisma schema configured for PostgreSQL', 'green');
  } else {
    log('\n⚠️  Prisma schema database provider unclear', 'yellow');
  }

  // Check if Prisma client exists
  const prismaClientPath = path.join(process.cwd(), 'node_modules', '@prisma', 'client');
  if (fs.existsSync(prismaClientPath)) {
    log('✅ Prisma client generated', 'green');
  } else {
    log('⚠️  Prisma client not generated', 'yellow');
    log('   Run "npm run db:generate" to generate it.', 'yellow');
  }

  return true;
}

function main() {
  log('=================================', 'cyan');
  log('  VideoMixPro Database Validator', 'cyan');
  log('=================================', 'cyan');

  const isValid = validateEnvironment();

  if (isValid) {
    log('\n✅ Database configuration is valid!', 'green');
    log('\nNext steps:', 'cyan');
    log('1. Run "npm run db:setup" to initialize database', 'yellow');
    log('2. Run "npm run dev" to start the backend', 'yellow');
    log('3. Run "cd frontend && npm start" to start the frontend', 'yellow');
  } else {
    log('\n❌ Database configuration needs attention!', 'red');
    log('\nPlease fix the issues above and run this script again.', 'yellow');
    process.exit(1);
  }
}

main();