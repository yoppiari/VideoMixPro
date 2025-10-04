#!/usr/bin/env node

/**
 * Fix failed migrations in PostgreSQL database
 * Removes SQLite migrations that are incompatible with PostgreSQL
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
    console.log('🔍 Checking for SQLite migrations in PostgreSQL database...');

    // Query all migrations including SQLite ones
    const allMigrations = await prisma.$queryRaw`
      SELECT migration_name, started_at, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY started_at DESC;
    `;

    console.log(`Found ${allMigrations.length} total migrations`);

    // Find SQLite migrations (they contain "sqlite" in the name)
    const sqliteMigrations = allMigrations.filter(m =>
      m.migration_name.toLowerCase().includes('sqlite')
    );

    if (sqliteMigrations.length === 0) {
      console.log('✅ No SQLite migrations found!');
      await prisma.$disconnect();
      return;
    }

    console.log(`\nFound ${sqliteMigrations.length} SQLite migrations to remove:`);
    sqliteMigrations.forEach(m => {
      console.log(`  - ${m.migration_name}`);
    });

    // Delete all SQLite migrations from the migration history
    console.log('\n🗑️  Removing SQLite migrations from database...');

    for (const migration of sqliteMigrations) {
      await prisma.$executeRaw`
        DELETE FROM "_prisma_migrations"
        WHERE migration_name = ${migration.migration_name};
      `;
      console.log(`  ✅ Removed: ${migration.migration_name}`);
    }

    console.log('\n✅ All SQLite migrations have been removed');
    console.log('💡 PostgreSQL migrations can now be applied cleanly');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error fixing migrations:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixFailedMigrations();
