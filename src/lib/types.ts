import { PrismaClient } from '@prisma/client'

export type UserRole = 'viewer' | 'editor' | 'admin';

export type BlogPostStatus = 'draft' | 'under review' | 'needs approval' | 'published';

export type BlogPost = {
  id: number
  title: string | null
  subtitle: string | null
  status: BlogPostStatus | null
  markdown: string | null
  markdownAiRevision: string | null
  createdAt: Date | string
  aiPublishingRecommendations: string | null
}

export type WorkflowTrigger = {
  event: string;
  conditions?: Record<string, unknown>;
};

export type WorkflowStep = {
  id: string;
  name: string;
  type: 'ai-action' | 'approval' | 'notification';
  config: Record<string, unknown>;
};

export type Workflow = {
  id: number
  createdAt: Date | string
  workflow: {
    steps: WorkflowStep[];
    triggers: WorkflowTrigger[];
  }
  enabled: boolean
  trigger: string | null
  description: string | null
  name: string | null
}

export type User = {
  id: number
  email: string
  name: string | null
  image: string | null
  role: UserRole
  emailVerified: Date | null
  createdAt: Date | string
  updatedAt: Date | string
}
