/**
 * Script: Update User Role in Remote Backend Database
 * 
 * This script updates a user's role in the remote backend database.
 * 
 * Usage:
 *   DATABASE_URL="file:/path/to/remote/database.db" npx tsx scripts/update-user-role-remote.ts <email> <role>
 *   or for remote backend:
 *   DATABASE_URL="file:/Volumes/Data/Software Development/TypeScript/nextjs-blog-backend/database.db" npx tsx scripts/update-user-role-remote.ts khoa0702@gmail.com admin
 */

import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

// Initialize Prisma client with remote database URL if provided
const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

type UserRole = 'viewer' | 'editor' | 'admin';

/**
 * Update user role
 */
async function updateUserRoleRemote(email: string, role: UserRole) {
  console.log(`🔄 Updating user role for ${email} to ${role}...`);
  console.log(`📡 Database URL: ${databaseUrl}\n`);

  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!existingUser) {
      console.log(`⚠️  User with email ${email} not found in database.`);
      console.log(`📝 Creating new user with role: ${role}...\n`);

      // Create the user with the specified role
      const newUser = await prisma.user.create({
        data: {
          email,
          role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      console.log('✅ User created successfully!');
      console.log('\n📊 New user info:');
      console.log(`   ID: ${newUser.id}`);
      console.log(`   Email: ${newUser.email}`);
      console.log(`   Name: ${newUser.name || 'N/A'}`);
      console.log(`   Role: ${newUser.role}`);
      console.log('\n💡 Note: The user may need to sign out and sign back in for the role change to take effect.');
      return;
    }

    console.log(`📋 Current user info:`);
    console.log(`   ID: ${existingUser.id}`);
    console.log(`   Email: ${existingUser.email}`);
    console.log(`   Name: ${existingUser.name || 'N/A'}`);
    console.log(`   Current Role: ${existingUser.role}`);
    console.log(`   New Role: ${role}\n`);

    // Update the user role
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    console.log('✅ User role updated successfully!');
    console.log('\n📊 Updated user info:');
    console.log(`   ID: ${updatedUser.id}`);
    console.log(`   Email: ${updatedUser.email}`);
    console.log(`   Name: ${updatedUser.name || 'N/A'}`);
    console.log(`   Role: ${updatedUser.role}`);
    console.log('\n💡 IMPORTANT: The user must sign out and sign back in for the role change to take effect.');
    console.log('   This is because roles are stored in JWT tokens which are cached.');
  } catch (error) {
    console.error('\n❌ Error updating user role:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run script if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Error: Missing required arguments');
    console.log('\nUsage:');
    console.log('  DATABASE_URL="file:/path/to/database.db" npx tsx scripts/update-user-role-remote.ts <email> <role>');
    console.log('\nExample:');
    console.log('  DATABASE_URL="file:./database.db" npx tsx scripts/update-user-role-remote.ts khoa0702@gmail.com admin');
    console.log('\nValid roles: viewer, editor, admin');
    console.log(`\nCurrent DATABASE_URL: ${databaseUrl}`);
    process.exit(1);
  }

  const [email, role] = args;

  // Validate role
  const validRoles: UserRole[] = ['viewer', 'editor', 'admin'];
  if (!validRoles.includes(role as UserRole)) {
    console.error(`❌ Error: Invalid role "${role}"`);
    console.log(`\nValid roles: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  updateUserRoleRemote(email, role as UserRole)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script error:', error);
      process.exit(1);
    });
}

export { updateUserRoleRemote };
