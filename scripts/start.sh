#!/bin/sh

echo "Starting backend application..."

# Ensure database directory exists
mkdir -p /app/data

# Set DATABASE_URL environment variable (already set in Dockerfile, but ensure it's exported)
export DATABASE_URL="${DATABASE_URL:-file:/app/data/prod.db}"

# Check if auto-migration is enabled via environment variable
# RUN_MIGRATIONS=true or AUTO_MIGRATE=true will enable automatic migrations
AUTO_MIGRATE="${RUN_MIGRATIONS:-${AUTO_MIGRATE:-false}}"

if [ "$AUTO_MIGRATE" = "true" ] || [ "$AUTO_MIGRATE" = "1" ]; then
  echo "🔄 AUTO_MIGRATE is enabled, running database migrations..."
  set +e  # Don't exit on migration errors
  npx prisma migrate deploy
  MIGRATION_EXIT_CODE=$?
  set -e  # Re-enable exit on error

  if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
    echo "✅ Migrations applied successfully."
  else
    echo "⚠️  Warning: Migration deployment completed with exit code $MIGRATION_EXIT_CODE"
    echo "ℹ️  This is normal if migrations are already applied or if this is the first run."
  fi
else
  echo "ℹ️  Auto-migration is disabled. Set RUN_MIGRATIONS=true or AUTO_MIGRATE=true to enable."
  echo "💡 To run migrations manually: npm run db:migrate:deploy"
fi

# Start the application
echo "Starting application..."
exec npm start
