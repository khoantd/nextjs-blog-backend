// Input validation utilities and schemas

import { z } from 'zod';

// Blog post validation schemas
export const createBlogPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  subtitle: z.string().max(300, 'Subtitle must be less than 300 characters').optional(),
  markdown: z.string().min(1, 'Content is required'),
});

export const updateBlogPostSchema = createBlogPostSchema.partial();

export const blogPostIdSchema = z.string().regex(/^\d+$/, 'Invalid blog post ID');

// User validation schemas
export const userRoleUpdateSchema = z.object({
  email: z.string().email(),
  role: z.enum(['viewer', 'editor', 'admin'])
});

// Workflow validation schemas
export const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(100),
  description: z.string().max(500).optional(),
  trigger: z.string().min(1, 'Trigger is required'),
  workflow: z.object({
    steps: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['ai-action', 'approval', 'notification']),
      config: z.record(z.string(), z.unknown()),
    })),
    triggers: z.array(z.object({
      event: z.string(),
      conditions: z.record(z.string(), z.unknown()).optional(),
    })),
  }),
});

// Type inference from schemas
export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;

// Validation helper functions
export const validateInput = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      throw new Error(`Validation failed: ${firstError.message}`);
    }
    throw new Error('Validation failed');
  }
};

// Sanitization utilities
export const sanitizeMarkdown = (markdown: string): string => {
  // Basic markdown sanitization - can be enhanced with a proper library
  return markdown
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '');
};

export const sanitizeTitle = (title: string): string => {
  return title
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 200);
};
