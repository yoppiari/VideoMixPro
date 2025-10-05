#!/bin/bash

# Database Wait Utility
# Waits for PostgreSQL to be ready before starting the application

set -e

echo "⏳ Waiting for PostgreSQL database..."

# Extract host and port from DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set"
    exit 1
fi

# Parse PostgreSQL connection string
# Format: postgresql://user:password@host:port/database
HOST=$(echo $DATABASE_URL | sed -e 's|^.*@\(.*\):.*\/.*$|\1|')
PORT=$(echo $DATABASE_URL | sed -e 's|^.*:\([0-9]*\)\/.*$|\1|')

if [ -z "$HOST" ] || [ -z "$PORT" ]; then
    echo "⚠️  Could not parse host/port from DATABASE_URL"
    echo "   Falling back to pg_isready..."

    # Fallback: use pg_isready with full URL
    TIMEOUT=60
    COUNT=0

    until pg_isready -d "$DATABASE_URL" > /dev/null 2>&1 || [ $COUNT -eq $TIMEOUT ]; do
        COUNT=$((COUNT + 1))
        echo "   Attempt $COUNT/$TIMEOUT..."
        sleep 1
    done

    if [ $COUNT -eq $TIMEOUT ]; then
        echo "❌ Database not ready after ${TIMEOUT}s"
        exit 1
    fi
else
    echo "   Host: $HOST"
    echo "   Port: $PORT"

    # Wait for TCP connection
    TIMEOUT=60
    COUNT=0

    until nc -z "$HOST" "$PORT" > /dev/null 2>&1 || [ $COUNT -eq $TIMEOUT ]; do
        COUNT=$((COUNT + 1))
        echo "   Attempt $COUNT/$TIMEOUT..."
        sleep 1
    done

    if [ $COUNT -eq $TIMEOUT ]; then
        echo "❌ Cannot connect to $HOST:$PORT after ${TIMEOUT}s"
        exit 1
    fi
fi

echo "✅ Database is ready!"
exit 0
