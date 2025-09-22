const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function testCredits() {
  try {
    console.log('Checking user credits in database...');

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        credits: true
      }
    });

    console.log('Users found:', users);

    if (users.length > 0) {
      const user = users[0];
      console.log(`\nFirst user: ${user.firstName} ${user.lastName} (${user.email})`);
      console.log(`Credits: ${user.credits}`);

      // Check credit transactions
      const transactions = await prisma.creditTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      console.log('\nRecent credit transactions:', transactions);

      // Check processing jobs
      const jobs = await prisma.processingJob.findMany({
        where: {
          project: {
            userId: user.id
          }
        },
        select: {
          id: true,
          status: true,
          creditsUsed: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });

      console.log('\nRecent processing jobs:', jobs);
    }

  } catch (error) {
    console.error('Error checking credits:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCredits();