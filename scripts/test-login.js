#!/usr/bin/env node

/**
 * Test login functionality and debug admin user
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function testLogin() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'postgres://postgres:6LP0Ojegy7IUU6kaX9lLkmZRUiAdAUNOltWyL3LegfYGR6rPQtB4DUSVqjdA78ES@107.155.75.50:5986/videomix'
      }
    }
  });

  try {
    console.log('🔍 Testing login functionality...\n');

    // Check if admin user exists
    const user = await prisma.user.findUnique({
      where: { email: 'admin@videomix.pro' }
    });

    if (!user) {
      console.log('❌ Admin user not found in database!');
      console.log('💡 Run: node scripts/create-admin.js');
      await prisma.$disconnect();
      return;
    }

    console.log('✅ Admin user found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Active: ${user.isActive}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Credits: ${user.credits}`);
    console.log(`   License: ${user.licenseType}`);
    console.log(`   Password hash: ${user.password.substring(0, 20)}...`);

    // Test password comparison
    console.log('\n🔐 Testing password...');
    const testPassword = 'Admin123!';
    const isValid = await bcrypt.compare(testPassword, user.password);

    if (isValid) {
      console.log(`✅ Password "${testPassword}" is VALID`);
    } else {
      console.log(`❌ Password "${testPassword}" is INVALID`);
      console.log('💡 Password might have been changed. Run create-admin.js to reset it.');
    }

    // Check JWT_SECRET
    console.log('\n🔑 Checking JWT_SECRET...');
    if (process.env.JWT_SECRET) {
      console.log(`✅ JWT_SECRET is set: ${process.env.JWT_SECRET.substring(0, 20)}...`);
    } else {
      console.log('❌ JWT_SECRET is NOT set!');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

testLogin();
