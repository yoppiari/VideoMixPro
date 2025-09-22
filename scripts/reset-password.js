#!/usr/bin/env node

/**
 * Password Reset Script
 * Resets the password for a specific user
 */

const { PrismaClient } = require('@prisma/client');
const bcryptjs = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

async function resetPassword() {
  const email = 'admin@videomix.pro';
  const newPassword = 'Admin123!';

  console.log('🔐 Setting up admin account:', email);

  try {
    // Hash the new password
    const hashedPassword = await bcryptjs.hash(newPassword, 10);

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email }
    });

    if (user) {
      // Update existing user's password
      user = await prisma.user.update({
        where: { email },
        data: {
          password: hashedPassword,
          updatedAt: new Date()
        }
      });
      console.log('✅ Password reset successful!');
    } else {
      // Create new admin user
      user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName: 'Admin',
          lastName: 'User',
          role: 'ADMIN',
          credits: 1000,
          licenseType: 'ENTERPRISE',
          isActive: true
        }
      });
      console.log('✅ Admin account created!');
    }

    console.log('📧 Email:', email);
    console.log('🔑 Password:', newPassword);
    console.log('👤 User:', user.firstName, user.lastName);
    console.log('💳 Credits:', user.credits);
    console.log('🔐 Role:', user.role);
    console.log('\n📝 You can now login with:');
    console.log('   Email: admin@videomix.pro');
    console.log('   Password: Admin123!');

  } catch (error) {
    console.error('❌ Error setting up admin account:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();