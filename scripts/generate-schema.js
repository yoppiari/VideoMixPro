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

// In Docker environment, always use PostgreSQL
const isDocker = process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV === 'true';
const finalProvider = isDocker ? 'postgresql' : provider;

// Read base schema
const basePath = path.join(__dirname, '..', 'prisma', 'schema-base.prisma');
const baseSchema = fs.readFileSync(basePath, 'utf8');

// Generate appropriate header based on final provider
let header = '';

if (finalProvider === 'postgresql') {
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

if (isDocker && provider !== 'postgresql') {
  console.log(`🔧 Docker environment detected - forcing PostgreSQL (was: ${provider})`);
}

console.log(`✅ Generated Prisma schema for ${finalProvider}`);
console.log(`   Database URL: ${databaseUrl.includes('postgres') ? databaseUrl.split('@')[1] : databaseUrl}`);