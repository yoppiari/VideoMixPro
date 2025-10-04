#!/usr/bin/env node

/**
 * Fix failed migrations in PostgreSQL database
 * Handles both SQLite migrations and any failed PostgreSQL migrations
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
    console.log('🔍 Checking for failed and incompatible migrations...');

    // Query all migrations
    const allMigrations = await prisma.$queryRaw`
      SELECT migration_name, started_at, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY started_at DESC;
    `;

    console.log(`Found ${allMigrations.length} total migrations in database`);

    // Find FAILED migrations (started but not finished and not rolled back)
    const failedMigrations = allMigrations.filter(m =>
      m.finished_at === null && m.rolled_back_at === null
    );

    // Find SQLite migrations (incompatible with PostgreSQL)
    const sqliteMigrations = allMigrations.filter(m =>
      m.migration_name.toLowerCase().includes('sqlite')
    );

    if (failedMigrations.length === 0 && sqliteMigrations.length === 0) {
      console.log('✅ No failed or SQLite migrations found!');
      await prisma.$disconnect();
      return;
    }

    // Handle failed migrations first
    if (failedMigrations.length > 0) {
      console.log(`\n⚠️  Found ${failedMigrations.length} failed migrations:`);
      failedMigrations.forEach(m => {
        console.log(`  - ${m.migration_name} (started: ${m.started_at})`);
      });

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
    }

    // Handle SQLite migrations
    if (sqliteMigrations.length > 0) {
      console.log(`\n🗑️  Found ${sqliteMigrations.length} SQLite migrations to remove:`);
      sqliteMigrations.forEach(m => {
        console.log(`  - ${m.migration_name}`);
      });

      console.log('\n🗑️  Removing incompatible SQLite migrations...');
      for (const migration of sqliteMigrations) {
        await prisma.$executeRaw`
          DELETE FROM "_prisma_migrations"
          WHERE migration_name = ${migration.migration_name};
        `;
        console.log(`  ✅ Removed: ${migration.migration_name}`);
      }
    }

    console.log('\n✅ All migration issues resolved');
    console.log('💡 PostgreSQL migrations can now be applied cleanly');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error fixing migrations:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixFailedMigrations();
