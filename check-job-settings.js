// Check job settings in database
const { PrismaClient } = require('@prisma/client');

// Set environment to use SQLite for development
process.env.DATABASE_URL_DEV = "file:./prisma/dev.db";

async function checkJobSettings() {
  const prisma = new PrismaClient();

  try {
    const job = await prisma.processingJob.findUnique({
      where: { id: 'cmfta4k7j00044j3pumevv3kp' },
      select: {
        id: true,
        status: true,
        settings: true
      }
    });

    if (job) {
      console.log('Job ID:', job.id);
      console.log('Status:', job.status);
      console.log('Settings (raw):', job.settings);

      if (job.settings) {
        try {
          const parsedSettings = JSON.parse(job.settings);
          console.log('\nParsed Settings:');
          console.log('- orderMixing:', parsedSettings.orderMixing);
          console.log('- speedMixing:', parsedSettings.speedMixing);
          console.log('- differentStartingVideo:', parsedSettings.differentStartingVideo);
          console.log('- groupMixing:', parsedSettings.groupMixing);
          console.log('- aspectRatio:', parsedSettings.aspectRatio);
          console.log('- resolution:', parsedSettings.resolution);
          console.log('- frameRate:', parsedSettings.frameRate);
          console.log('- durationType:', parsedSettings.durationType);
          console.log('- fixedDuration:', parsedSettings.fixedDuration);
        } catch (error) {
          console.log('Error parsing settings JSON:', error.message);
        }
      }
    } else {
      console.log('Job not found');
    }
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkJobSettings().catch(console.error);