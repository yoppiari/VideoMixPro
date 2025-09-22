const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    // Count all data
    const users = await prisma.user.count();
    const projects = await prisma.project.count();
    const videos = await prisma.videoFile.count();
    const jobs = await prisma.processingJob.count();

    console.log('📊 Database Statistics:');
    console.log('👥 Users:', users);
    console.log('📁 Projects:', projects);
    console.log('🎬 Videos:', videos);
    console.log('⚙️ Processing Jobs:', jobs);

    // Get admin user
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@videomix.pro' }
    });

    if (adminUser) {
      console.log('\n👤 Admin User Found:');
      console.log('   ID:', adminUser.id);
      console.log('   Name:', adminUser.firstName, adminUser.lastName);
      console.log('   Credits:', adminUser.credits);

      // Get admin's projects
      const adminProjects = await prisma.project.findMany({
        where: { userId: adminUser.id },
        include: {
          videoFiles: true,
          processingJobs: true
        }
      });

      console.log('\n📂 Admin Projects:', adminProjects.length);
      if (adminProjects.length > 0) {
        adminProjects.forEach(p => {
          console.log(`   - ${p.name}`);
          console.log(`     Videos: ${p.videoFiles.length}`);
          console.log(`     Jobs: ${p.processingJobs.length}`);
          console.log(`     Status: ${p.status}`);
        });
      }
    } else {
      console.log('\n❌ Admin user not found!');
    }

    // Check all projects
    const allProjects = await prisma.project.findMany({
      include: {
        user: true,
        videoFiles: true,
        processingJobs: true
      }
    });

    console.log('\n📊 All Projects in Database:');
    if (allProjects.length > 0) {
      allProjects.forEach(p => {
        console.log(`   - ${p.name} (User: ${p.user.email})`);
        console.log(`     Videos: ${p.videoFiles.length}`);
        console.log(`     Jobs: ${p.processingJobs.length}`);
        console.log(`     Status: ${p.status}`);
      });
    } else {
      console.log('   No projects found in database');
    }

  } catch (error) {
    console.error('❌ Error checking data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();