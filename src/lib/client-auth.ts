import { UserRole } from "./types";

// Role-based access control helper functions (client-safe)
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
