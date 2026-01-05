// Application constants and enums

export const BLOG_POST_STATUSES = {
  DRAFT: 'draft',
  UNDER_REVIEW: 'under review',
  NEEDS_APPROVAL: 'needs approval',
  PUBLISHED: 'published',
} as const;

export const WORKFLOW_ACTION_TYPES = {
  AI_ACTION: 'ai-action',
  APPROVAL: 'approval',
  NOTIFICATION: 'notification',
} as const;

export const AI_MODELS = {
  GPT_4O_MINI: 'gpt-4o-mini',
  GPT_4O: 'gpt-4o',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
} as const;

export const WORKFLOW_EVENTS = {
  BLOG_POST_UPDATED: 'blog-post.updated',
  BLOG_POST_PUBLISHED: 'blog-post.published',
  BLOG_POST_UNPUBLISHED: 'blog-post.unpublished',
  BLOG_POST_APPROVE_AI_SUGGESTIONS: 'blog-post.approve-ai-suggestions',
} as const;

export const API_ERRORS = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DATABASE_ERROR: 'DATABASE_ERROR',
  WORKFLOW_ERROR: 'WORKFLOW_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

export const SWR_CONFIG = {
  REFRESH_INTERVAL: 5000,
  ERROR_RETRY_COUNT: 3,
  ERROR_RETRY_INTERVAL: 2000,
  DEDUPING_INTERVAL: 1000,
} as const;
