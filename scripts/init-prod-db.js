#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Initializing production database...');

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

try {
  // Run Prisma migrations
  console.log('📦 Running database migrations...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env }
  });

  // Generate Prisma client
  console.log('🔧 Generating Prisma client...');
  execSync('npx prisma generate', {
    stdio: 'inherit',
    env: { ...process.env }
  });

  // Create backup directory if it doesn't exist
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log('📁 Created backup directory');
  }

  // Create receipts directory if it doesn't exist
  const receiptsDir = path.join(process.cwd(), 'receipts');
  if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true });
    console.log('📁 Created receipts directory');
  }

  // Create invoices directory if it doesn't exist
  const invoicesDir = path.join(process.cwd(), 'invoices');
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
    console.log('📁 Created invoices directory');
  }

  console.log('✅ Production database initialized successfully!');

} catch (error) {
  console.error('❌ Failed to initialize production database:', error.message);
  process.exit(1);
}