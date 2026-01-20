import { execSync } from 'child_process';
import { prisma } from './prisma';

/**
 * Run database migrations programmatically
 * This can be called from the application startup
 */
export async function runMigrations(): Promise<{ success: boolean; message: string }> {
  try {
    console.log('🔄 Running database migrations...');
    
    // Use Prisma migrate deploy for production (applies pending migrations)
    // This is safe to run multiple times - it only applies pending migrations
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: process.env,
    });
    
    console.log('✅ Database migrations completed successfully');
    return { success: true, message: 'Migrations applied successfully' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Database migration failed:', errorMessage);
    
    // Check if it's a "no pending migrations" error (which is OK)
    if (errorMessage.includes('No pending migrations') || 
        errorMessage.includes('already applied')) {
      console.log('ℹ️  No pending migrations to apply');
      return { success: true, message: 'No pending migrations' };
    }
    
    return { success: false, message: errorMessage };
  }
}

/**
 * Check if database tables exist by attempting a simple query
 */
export async function checkDatabaseTables(): Promise<{ exists: boolean; error?: string }> {
  try {
    // Try to query a table that should exist
    await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' LIMIT 1`;
    return { exists: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { exists: false, error: errorMessage };
  }
}

/**
 * Initialize database - run migrations if enabled and check database health
 */
export async function initializeDatabase(): Promise<void> {
  const shouldRunMigrations = process.env.RUN_MIGRATIONS === 'true' || 
                              process.env.AUTO_MIGRATE === 'true' ||
                              process.env.AUTO_MIGRATE === '1';
  
  if (shouldRunMigrations) {
    console.log('📦 AUTO_MIGRATE is enabled, running migrations on startup...');
    const result = await runMigrations();
    
    if (!result.success) {
      console.warn('⚠️  Migration failed, but continuing startup:', result.message);
      console.warn('💡 You may need to run migrations manually: npm run db:migrate:deploy');
    }
  } else {
    console.log('ℹ️  Auto-migration is disabled. Set RUN_MIGRATIONS=true or AUTO_MIGRATE=true to enable.');
    console.log('💡 To run migrations manually: npm run db:migrate:deploy');
  }
  
  // Check database health
  const dbCheck = await checkDatabaseTables();
  if (!dbCheck.exists) {
    console.warn('⚠️  Database tables may not exist. Consider running migrations.');
  }
}
