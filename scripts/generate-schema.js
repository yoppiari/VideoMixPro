#!/usr/bin/env node

/**
 * Schema Generator for SQLite/PostgreSQL Compatibility
 * Generates the appropriate Prisma schema based on the DATABASE_PROVIDER environment variable
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const provider = process.env.DATABASE_PROVIDER || 'sqlite';
const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';

// Read base schema
const basePath = path.join(__dirname, '..', 'prisma', 'schema-base.prisma');
const baseSchema = fs.readFileSync(basePath, 'utf8');

// Generate appropriate header based on provider
let header = '';

if (provider === 'postgresql') {
  header = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

`;
} else {
  header = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

`;
}

// Combine header with base schema
const fullSchema = header + baseSchema;

// Write to schema.prisma
const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
fs.writeFileSync(schemaPath, fullSchema);

console.log(`✅ Generated Prisma schema for ${provider}`);
console.log(`   Database URL: ${databaseUrl.includes('postgres') ? databaseUrl.split('@')[1] : databaseUrl}`);