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

// Watchlist validation schemas
export const stockSymbolSchema = z
  .string()
  .trim()
  .min(1, 'Symbol is required')
  .max(15, 'Symbol must be less than 15 characters')
  .regex(/^[A-Za-z0-9.\-]+$/, 'Symbol must be alphanumeric and may include . or -');

export const watchlistCreateSchema = z.object({
  name: z.string().trim().min(1, 'Watchlist name is required').max(50, 'Watchlist name must be less than 50 characters'),
  symbols: z.array(stockSymbolSchema).max(500, 'Too many symbols').optional(),
});

export const watchlistUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Watchlist name is required').max(50, 'Watchlist name must be less than 50 characters').optional(),
  symbols: z.array(stockSymbolSchema).max(500, 'Too many symbols').optional(),
});

export const watchlistSymbolsSchema = z.object({
  symbols: z.array(stockSymbolSchema).min(1, 'At least one symbol is required').max(500, 'Too many symbols'),
});

// Authentication validation schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const setPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password confirmation is required').optional(),
}).refine((data) => {
  // If confirmPassword is provided, it must match password
  if (data.confirmPassword !== undefined) {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Type inference from schemas
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

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

// Prediction feedback validation schemas
export const predictionFeedbackSchema = z.object({
  isCorrect: z.boolean(),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional(),
});

export type PredictionFeedbackInput = z.infer<typeof predictionFeedbackSchema>;

// Stock analysis update schema (single resource)
export const stockAnalysisUpdateSchema = z
  .object({
    favorite: z.boolean().optional(),
    market: z.enum(['US', 'VN']).nullable().optional(),
    minPctChange: z
      .number()
      .positive('minPctChange must be positive')
      .optional(),
    regenerate: z
      .boolean()
      .optional()
      .default(false), // Whether to regenerate factors after updating minPctChange
  })
  .refine(
    (data) => {
      // Allow regenerate alone, or at least one other field
      const hasRegenerate = data.regenerate === true;
      const hasOtherFields = Object.keys(data).filter(k => k !== 'regenerate').length > 0;
      return hasRegenerate || hasOtherFields;
    },
    {
      message: 'At least one field must be provided (or regenerate must be true)',
    }
  );

// Bulk Min Change update schema
export const stockAnalysisBulkMinPctChangeSchema = z.object({
  symbols: z
    .array(stockSymbolSchema)
    .min(1, 'At least one symbol is required')
    .max(500, 'Too many symbols'),
  minPctChange: z
    .number()
    .positive('minPctChange must be positive')
    .optional(),
  regenerate: z
    .boolean()
    .optional()
    .default(false), // Whether to regenerate factors after updating minPctChange
});

// ML Feature Importance validation schema
export const mlFeatureImportanceSchema = z
  .preprocess(
    (data) => {
      // If symbol is an array, move it to symbols field (merge if symbols already exists)
      if (data && typeof data === 'object' && 'symbol' in data && Array.isArray(data.symbol)) {
        const existingSymbols = 'symbols' in data && Array.isArray(data.symbols) ? data.symbols : [];
        return {
          ...data,
          symbols: [...existingSymbols, ...data.symbol],
          symbol: undefined,
        };
      }
      return data;
    },
    z.object({
      symbol: stockSymbolSchema.optional(),
      symbols: z
        .array(stockSymbolSchema)
        .min(1, 'At least one symbol is required')
        .max(100, 'Too many symbols (max 100)')
        .optional(),
      market: z.enum(['US', 'VN']).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
      targetPct: z
        .number()
        .positive('targetPct must be positive')
        .max(1, 'targetPct must be between 0 and 1')
        .optional(),
      topN: z
        .number()
        .int('topN must be an integer')
        .positive('topN must be positive')
        .max(50, 'topN must be at most 50')
        .optional(),
      stockAnalysisId: z
        .number()
        .int('stockAnalysisId must be an integer')
        .positive('stockAnalysisId must be positive')
        .optional(),
    })
  )
  .refine(
    (data) => {
      // Either symbol, symbols, or stockAnalysisId must be provided
      const hasSymbol = !!data.symbol;
      const hasSymbols = !!data.symbols && data.symbols.length > 0;
      const hasStockAnalysisId = data.stockAnalysisId !== undefined;
      return hasSymbol || hasSymbols || hasStockAnalysisId;
    },
    {
      message: 'Either symbol, symbols, or stockAnalysisId is required',
    }
  )
  .refine(
    (data) => {
      // Cannot provide both symbol and symbols
      const hasSymbol = !!data.symbol;
      const hasSymbols = !!data.symbols && data.symbols.length > 0;
      return !(hasSymbol && hasSymbols);
    },
    {
      message: 'Cannot provide both symbol and symbols',
      path: ['symbols'],
    }
  );
