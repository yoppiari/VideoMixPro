#!/bin/bash

# VideoMixPro Migration Utility Script
# This script provides migration management utilities for Docker deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if PostgreSQL is ready
wait_for_postgres() {
    log_info "Waiting for PostgreSQL to be ready..."
    
    for i in {1..30}; do
        if pg_isready -U videomixpro -d videomixpro > /dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            return 0
        fi
        
        log_info "Waiting for PostgreSQL... (attempt $i/30)"
        sleep 2
    done
    
    log_error "PostgreSQL failed to start within 60 seconds"
    return 1
}

# Function to run migrations
run_migrations() {
    log_info "Running database migrations..."
    
    cd "$APP_DIR"
    
    # Set environment variables
    export DATABASE_URL="${DATABASE_URL:-postgresql://videomixpro:videomixpro123@localhost:5432/videomixpro}"
    export DATABASE_PROVIDER="postgresql"
    
    # Check if migration files exist
    if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations)" ]; then
        log_info "Found migration files, running Prisma migrate deploy..."
        
        if npx prisma migrate deploy; then
            log_success "Migrations applied successfully"
            
            # Show migration status
            log_info "Current migration status:"
            npx prisma migrate status
        else
            log_error "Migration deployment failed"
            return 1
        fi
    else
        log_warning "No migration files found, using db push..."
        
        if npx prisma db push; then
            log_success "Database schema pushed successfully"
        else
            log_error "Database push failed"
            return 1
        fi
    fi
    
    # Generate Prisma client
    log_info "Generating Prisma client..."
    if npx prisma generate; then
        log_success "Prisma client generated successfully"
    else
        log_error "Prisma client generation failed"
        return 1
    fi
    
    return 0
}

# Function to create admin user
create_admin_user() {
    log_info "Creating admin user..."
    
    cd "$APP_DIR"
    
    export DATABASE_URL="${DATABASE_URL:-postgresql://videomixpro:videomixpro123@localhost:5432/videomixpro}"
    
    node -e "
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcryptjs');
    
    async function createAdmin() {
        const prisma = new PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL } }
        });
        
        try {
            const hashedPassword = await bcrypt.hash('Admin123!', 12);
            
            const admin = await prisma.user.upsert({
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
            await prisma.\$disconnect();
        }
    }
    
    createAdmin();
    "
    
    if [ $? -eq 0 ]; then
        log_success "Admin user setup completed"
    else
        log_error "Admin user creation failed"
        return 1
    fi
}

# Function to check migration status
check_migration_status() {
    log_info "Checking migration status..."
    
    cd "$APP_DIR"
    export DATABASE_URL="${DATABASE_URL:-postgresql://videomixpro:videomixpro123@localhost:5432/videomixpro}"
    
    npx prisma migrate status
}

# Function to reset database (WARNING: destructive)
reset_database() {
    log_warning "WARNING: This will delete all data in the database!"
    
    cd "$APP_DIR"
    export DATABASE_URL="${DATABASE_URL:-postgresql://videomixpro:videomixpro123@localhost:5432/videomixpro}"
    
    log_info "Resetting database..."
    npx prisma migrate reset --force
    
    log_success "Database reset completed"
}

# Function to backup database
backup_database() {
    local backup_file="${1:-/app/backups/backup_$(date +%Y%m%d_%H%M%S).sql}"
    
    log_info "Creating database backup: $backup_file"
    
    mkdir -p "$(dirname "$backup_file")"
    
    if pg_dump -U videomixpro -d videomixpro > "$backup_file"; then
        log_success "Database backup created: $backup_file"
    else
        log_error "Database backup failed"
        return 1
    fi
}

# Function to restore database from backup
restore_database() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "Please specify backup file path"
        return 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log_warning "WARNING: This will replace all data in the database!"
    log_info "Restoring database from: $backup_file"
    
    if psql -U videomixpro -d videomixpro < "$backup_file"; then
        log_success "Database restored successfully"
    else
        log_error "Database restore failed"
        return 1
    fi
}

# Main command handling
case "${1:-help}" in
    "migrate")
        wait_for_postgres
        run_migrations
        ;;
    "admin")
        wait_for_postgres
        create_admin_user
        ;;
    "status")
        wait_for_postgres
        check_migration_status
        ;;
    "reset")
        wait_for_postgres
        reset_database
        ;;
    "backup")
        wait_for_postgres
        backup_database "$2"
        ;;
    "restore")
        wait_for_postgres
        restore_database "$2"
        ;;
    "init")
        wait_for_postgres
        run_migrations
        create_admin_user
        ;;
    "help"|*)
        echo "VideoMixPro Migration Utility"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  migrate                Run database migrations"
        echo "  admin                  Create/update admin user"
        echo "  status                 Check migration status"
        echo "  reset                  Reset database (WARNING: destructive)"
        echo "  backup [file]          Create database backup"
        echo "  restore <file>         Restore database from backup"
        echo "  init                   Initialize database (migrate + admin)"
        echo "  help                   Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 init                # Initialize database with migrations and admin user"
        echo "  $0 backup              # Create backup with timestamp"
        echo "  $0 restore backup.sql  # Restore from specific backup file"
        ;;
esac