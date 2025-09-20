const { PrismaClient } = require('../node_modules/.prisma/client-dev');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('password123', 10);

  try {
    const admin = await prisma.user.upsert({
      where: { email: 'admin@videomix.pro' },
      update: {},
      create: {
        email: 'admin@videomix.pro',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        credits: 1000,
        licenseType: 'ENTERPRISE',
        licenseExpiry: new Date('2025-12-31')
      }
    });

    console.log('Admin user created:', admin.email);

    // Create regular test user
    const testUser = await prisma.user.upsert({
      where: { email: 'test@videomix.pro' },
      update: {},
      create: {
        email: 'test@videomix.pro',
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        role: 'USER',
        isActive: true,
        credits: 100,
        licenseType: 'PRO',
        licenseExpiry: new Date('2025-06-30')
      }
    });

    console.log('Test user created:', testUser.email);

    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });