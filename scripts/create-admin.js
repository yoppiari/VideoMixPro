const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    const prisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } }
    });

    try {
        const hashedPassword = await bcrypt.hash('Admin123!', 12);

        await prisma.user.upsert({
            where: { email: 'admin@videomix.pro' },
            update: {
                credits: 1000,
                licenseType: 'ENTERPRISE',
                role: 'ADMIN'
            },
            create: {
                email: 'admin@videomix.pro',
                password: hashedPassword,
                firstName: 'Admin',
                lastName: 'User',
                credits: 1000,
                licenseType: 'ENTERPRISE',
                role: 'ADMIN'
            }
        });

        console.log('✅ Admin user created/updated successfully');
        console.log('📧 Email: admin@videomix.pro');
        console.log('🔑 Password: Admin123!');
        console.log('💳 Credits: 1000');
        console.log('👤 Role: ADMIN');

    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

createAdmin();
