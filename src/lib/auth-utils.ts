import { getToken } from "next-auth/jwt";
import { Request } from "express";
import { UserRole } from "./types";

class AuthenticationError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends Error {
  constructor(message: string, public statusCode: number = 403) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export async function getCurrentUser(req: Request) {
  // Rely on the user object populated by the authenticateToken middleware
  const user = (req as any).user;

  if (!user) return null;

  return user as {
    id: string;
    email: string;
    name?: string;
    image?: string;
    role: UserRole;
  };
}

export async function requireAuth(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    throw new AuthenticationError("Authentication required");
  }
  return user;
}

export async function requireRole(req: Request, requiredRole: UserRole) {
  const user = await requireAuth(req);

  const roleHierarchy: Record<UserRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
  };

  if (roleHierarchy[user.role] < roleHierarchy[requiredRole]) {
    throw new AuthorizationError("Insufficient permissions");
  }

  return user;
}

export { AuthenticationError, AuthorizationError };
