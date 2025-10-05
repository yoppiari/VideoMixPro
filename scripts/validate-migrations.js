#!/usr/bin/env node

/**
 * Migration Validation Script
 * Validates PostgreSQL migration files before deployment
 */

const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations-postgres');
const errors = [];
const warnings = [];

console.log('🔍 Validating PostgreSQL Migrations...\n');

// Check if migrations directory exists
if (!fs.existsSync(migrationsDir)) {
  console.error('❌ ERROR: migrations-postgres directory not found!');
  process.exit(1);
}

// Get all migration directories
const migrations = fs.readdirSync(migrationsDir)
  .filter(file => {
    const fullPath = path.join(migrationsDir, file);
    return fs.statSync(fullPath).isDirectory();
  })
  .sort();

console.log(`Found ${migrations.length} migration(s):\n`);

migrations.forEach((migration, index) => {
  console.log(`${index + 1}. ${migration}`);

  const migrationPath = path.join(migrationsDir, migration);
  const sqlFile = path.join(migrationPath, 'migration.sql');

  // Check if migration.sql exists
  if (!fs.existsSync(sqlFile)) {
    errors.push(`Missing migration.sql in ${migration}`);
    return;
  }

  // Read and validate SQL content
  const sql = fs.readFileSync(sqlFile, 'utf8');

  // Check for SQLite-specific syntax
  const sqliteSyntax = [
    { pattern: /INTEGER PRIMARY KEY AUTOINCREMENT/i, name: 'AUTOINCREMENT' },
    { pattern: /PRAGMA/i, name: 'PRAGMA statements' },
    { pattern: /WITHOUT ROWID/i, name: 'WITHOUT ROWID' },
  ];

  sqliteSyntax.forEach(({ pattern, name }) => {
    if (pattern.test(sql)) {
      errors.push(`SQLite syntax detected in ${migration}: ${name}`);
    }
  });

  // Check for required PostgreSQL elements
  if (!sql.includes('CREATE TABLE') && !sql.includes('ALTER TABLE')) {
    warnings.push(`No CREATE/ALTER TABLE found in ${migration} - might be empty`);
  }

  // Check for proper foreign keys
  if (sql.includes('REFERENCES') && !sql.includes('ON DELETE')) {
    warnings.push(`Foreign keys in ${migration} missing ON DELETE clause`);
  }
});

console.log('\n📊 Validation Results:\n');

if (errors.length > 0) {
  console.log('❌ ERRORS:');
  errors.forEach(error => console.log(`   - ${error}`));
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  WARNINGS:');
  warnings.forEach(warning => console.log(`   - ${warning}`));
  console.log('');
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All migrations validated successfully!');
  process.exit(0);
} else if (errors.length > 0) {
  console.log('❌ Migration validation failed!');
  process.exit(1);
} else {
  console.log('⚠️  Migration validation completed with warnings');
  process.exit(0);
}
