const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getHijabId() {
  try {
    const project = await prisma.project.findFirst({
      where: { name: 'Hijab' }
    });

    if (project) {
      console.log('Hijab Project ID:', project.id);
    } else {
      console.log('Hijab project not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

getHijabId();