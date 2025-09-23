const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkVideoStatus() {
  try {
    // Get all projects with their videos
    const projects = await prisma.project.findMany({
      where: {
        name: { in: ['Hijab', 'Dani'] }
      },
      include: {
        videoFiles: {
          select: {
            id: true,
            originalName: true,
            duration: true,
            size: true,
            format: true,
            resolution: true
          }
        },
        videoGroups: true
      }
    });

    console.log('\n📊 Project Video Status Check:\n');
    console.log('='.repeat(60));

    for (const project of projects) {
      console.log(`\n📁 Project: ${project.name}`);
      console.log(`   Status: ${project.status}`);
      console.log(`   Total Videos: ${project.videoFiles.length}`);
      console.log(`   Total Groups: ${project.videoGroups.length}`);

      // Parse settings to check groups
      const settings = typeof project.settings === 'string'
        ? JSON.parse(project.settings)
        : project.settings;

      console.log(`   Settings Groups: ${settings?.groups?.length || 0}`);

      console.log('\n   Video Details:');
      project.videoFiles.forEach((video, index) => {
        console.log(`   ${index + 1}. ${video.originalName}`);
        console.log(`      - Format: ${video.format}`);
        console.log(`      - Resolution: ${video.resolution}`);
        console.log(`      - Duration: ${video.duration}s`);
        console.log(`      - Size: ${(video.size / 1024 / 1024).toFixed(2)}MB`);
      });
    }

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('Error checking video status:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkVideoStatus();