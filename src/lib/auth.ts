import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";
import { UserRole } from "./types";
import { getGoogleClientId, getGoogleClientSecret } from "./server-auth";

// Type assertion for PrismaAdapter compatibility
const prismaClient = prisma as any;

if (process.env.NODE_ENV === "development") {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const envClientId = process.env.GOOGLE_CLIENT_ID;
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  console.log('Google Client ID:', clientId ? 'Set' : 'Not set');
  console.log('Google Client Secret:', clientSecret ? 'Set' : 'Not set');
  console.log('NextAuth URL:', process.env.NEXTAUTH_URL);

  // Determine config source more accurately
  let configSource = 'Unknown';
  const isEnvPlaceholder = envClientId === 'your_google_client_id_here' ||
    envClientSecret === 'your_google_client_secret_here' ||
    !envClientId || !envClientSecret;

  if (clientId && isEnvPlaceholder) {
    configSource = 'JSON file';
  } else if (!isEnvPlaceholder) {
    configSource = 'Environment variables';
  } else if (clientId) {
    configSource = 'JSON file (fallback)';
  }

  console.log('Config Source:', configSource);
}

// authOptions is only used in Next.js frontend, not in Express backend
// We export it conditionally to avoid ESM import issues during CommonJS compilation
// The frontend Next.js app will handle the PrismaAdapter import separately
export const authOptions: NextAuthOptions = {
  // Adapter will be set in Next.js frontend where ES modules are supported
  // For backend, we don't need the adapter since we use JWT tokens directly
  adapter: undefined as any,
  providers: [
    GoogleProvider({
      clientId: getGoogleClientId() || process.env.GOOGLE_CLIENT_ID!,
      clientSecret: getGoogleClientSecret() || process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // Persist the user role and ID to the token
      if (user && account) {
        // First time sign-in, fetch user from database and assign/update role
        try {
          if (!prismaClient?.user) {
            console.error('Prisma client or user model not available');
            return token;
          }

          // Determine role based on email domain or admin configuration
          const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim()) || [];
          const adminDomains = process.env.ADMIN_DOMAINS?.split(',').map(domain => domain.trim()) || [];

          const isAdmin = user.email && (
            adminEmails.includes(user.email) ||
            adminDomains.some(domain => user.email!.endsWith(`@${domain}`)) ||
            user.email.endsWith("@yourdomain.com")
          );
          const role: UserRole = isAdmin ? "admin" : "viewer";

          // Update user role in database (this runs after PrismaAdapter creates the user/account)
          const dbUser = await prismaClient.user.upsert({
            where: { email: user.email! },
            update: { role },
            create: {
              email: user.email!,
              role,
              name: user.name || null,
              image: user.image || null
            },
            select: { id: true, role: true }
          });

          if (dbUser) {
            token.sub = dbUser.id.toString();
            token.role = dbUser.role as UserRole;
            token.email = user.email || "";
            token.name = user.name || "";
            token.image = user.image || "";
          }
        } catch (error) {
          console.error('Error fetching user in JWT callback:', error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      // For JWT strategy, get data from token instead of database
      if (token.sub && session.user) {
        session.user.id = token.sub;
        session.user.role = token.role as UserRole;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.image as string;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // Let PrismaAdapter handle User/Account creation automatically
      // Role assignment is handled in the JWT callback after successful authentication
      return true;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  debug: process.env.NODE_ENV === "development",
};

// Role-based access control helper functions (server-side)
export const hasPermission = (userRole: UserRole, requiredRole: UserRole): boolean => {
  const roleHierarchy: Record<UserRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};

export const canCreatePost = (role: UserRole) => hasPermission(role, "editor");
export const canEditPost = (role: UserRole) => hasPermission(role, "editor");
export const canDeletePost = (role: UserRole) => hasPermission(role, "admin");
export const canManageWorkflows = (role: UserRole) => hasPermission(role, "editor");
export const canManageUsers = (role: UserRole) => hasPermission(role, "admin");
export const canViewPosts = (role: UserRole) => role === "viewer" || role === "editor" || role === "admin";
export const canViewWorkflows = (role: UserRole) => role === "viewer" || role === "editor" || role === "admin";
export const canCreateStockAnalysis = (role: UserRole) => hasPermission(role, "editor");
export const canViewStockAnalyses = (role: UserRole) => role === "viewer" || role === "editor" || role === "admin";
export const canDeleteStockAnalysis = (role: UserRole) => hasPermission(role, "admin");
export const canViewUsers = (role: UserRole) => hasPermission(role, "admin");
