#!/usr/bin/env node

/**
 * Fix failed migrations in PostgreSQL database
 * Marks failed migrations as rolled back so new migrations can proceed
 */

const { PrismaClient } = require('@prisma/client');

async function fixFailedMigrations() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  try {
    console.log('🔍 Checking for failed migrations...');

    // Query the _prisma_migrations table
    const failedMigrations = await prisma.$queryRaw`
      SELECT migration_name, started_at, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
      ORDER BY started_at DESC;
    `;

    console.log(`Found ${failedMigrations.length} failed migrations:`);
    failedMigrations.forEach(m => {
      console.log(`  - ${m.migration_name} (started: ${m.started_at})`);
    });

    if (failedMigrations.length === 0) {
      console.log('✅ No failed migrations found!');
      await prisma.$disconnect();
      return;
    }

    // Mark all failed migrations as rolled back
    console.log('\n🔄 Marking failed migrations as rolled back...');

    for (const migration of failedMigrations) {
      await prisma.$executeRaw`
        UPDATE "_prisma_migrations"
        SET rolled_back_at = NOW()
        WHERE migration_name = ${migration.migration_name}
          AND finished_at IS NULL
          AND rolled_back_at IS NULL;
      `;
      console.log(`  ✅ Rolled back: ${migration.migration_name}`);
    }

    console.log('\n✅ All failed migrations have been marked as rolled back');
    console.log('💡 You can now run prisma migrate deploy again');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error fixing migrations:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixFailedMigrations();
