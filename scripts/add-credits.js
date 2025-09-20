// Set environment for SQLite
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = 'file:./dev.db';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./dev.db'
    }
  }
});

async function addCreditsToUsers() {
  try {
    // Update all users to have 1000 credits
    const result = await prisma.user.updateMany({
      data: {
        credits: 1000
      }
    });

    console.log(`✅ Successfully updated ${result.count} user(s) with 1000 credits`);

    // Log current users and their credits
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        credits: true
      }
    });

    console.log('\n📊 Current user credits:');
    users.forEach(user => {
      console.log(`   - ${user.name || user.email}: ${user.credits} credits`);
    });

  } catch (error) {
    console.error('❌ Error updating credits:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addCreditsToUsers();