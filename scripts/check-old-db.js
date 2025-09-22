const { PrismaClient } = require('@prisma/client');
const path = require('path');

// Point to the old database
process.env.DATABASE_URL = 'file:./prisma/prisma/dev.db';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./prisma/prisma/dev.db'
    }
  }
});

async function checkOldDatabase() {
  console.log('🔍 Checking OLD database at: ./prisma/prisma/dev.db\n');

  try {
    // Count all data
    const users = await prisma.user.count();
    const projects = await prisma.project.count();
    const videos = await prisma.videoFile.count();
    const jobs = await prisma.processingJob.count();

    console.log('📊 OLD Database Statistics:');
    console.log('👥 Users:', users);
    console.log('📁 Projects:', projects);
    console.log('🎬 Videos:', videos);
    console.log('⚙️ Processing Jobs:', jobs);

    if (projects > 0) {
      console.log('\n📂 Projects Found in OLD Database:');
      const allProjects = await prisma.project.findMany({
        include: {
          user: true,
          videoFiles: true,
          processingJobs: true
        }
      });

      allProjects.forEach(p => {
        console.log(`\n   📁 ${p.name} (ID: ${p.id})`);
        console.log(`      User: ${p.user.email}`);
        console.log(`      Videos: ${p.videoFiles.length}`);
        console.log(`      Jobs: ${p.processingJobs.length}`);
        console.log(`      Status: ${p.status}`);
        console.log(`      Created: ${p.createdAt}`);
      });

      console.log('\n💡 To restore this data to the current database:');
      console.log('   1. Backup current database: cp prisma/dev.db prisma/dev.db.backup');
      console.log('   2. Copy old database: cp prisma/prisma/dev.db prisma/dev.db');
      console.log('   3. Restart the backend server');
    }

    if (users > 0) {
      console.log('\n👥 Users in OLD Database:');
      const allUsers = await prisma.user.findMany({
        select: {
          email: true,
          firstName: true,
          lastName: true,
          credits: true,
          createdAt: true
        }
      });

      allUsers.forEach(u => {
        console.log(`   - ${u.email} (${u.firstName} ${u.lastName}) - ${u.credits} credits`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking old database:', error.message);
    console.log('\n⚠️ The old database might be corrupted or have a different schema.');
  } finally {
    await prisma.$disconnect();
  }
}

checkOldDatabase();