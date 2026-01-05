"use server";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { type BlogPost, type Workflow } from "@/lib/types";
import { AppError, DatabaseError, handleError, logError } from "@/lib/errors";
import { validateInput, blogPostIdSchema, userRoleUpdateSchema } from "@/lib/validation";
import { z } from "zod";
import { requireRole } from "@/lib/auth-utils";
import { Request } from "express";
import { analyzeStockData, createFactorTable } from "@/lib/data-analysis-danfo";

// Base class for blog post operations
class BlogPostService {
  static async updateStatus(id: string, status: string, additionalData: Record<string, unknown> = {}) {
    try {
      const validatedId = validateInput(blogPostIdSchema, id);

      return await prisma.blogPost.update({
        where: { id: Number(validatedId) },
        data: {
          status,
          markdownAiRevision: null,
          ...additionalData,
        },
      });
    } catch (error) {
      logError(error as Error, { action: 'updateStatus', id, status });
      throw new DatabaseError('Failed to update blog post status', error as Error);
    }
  }

  static async sendEvent(eventName: string, data: Record<string, unknown>) {
    try {
      await inngest.send({ name: eventName, data });
    } catch (error) {
      logError(error as Error, { action: 'sendEvent', eventName, data });
      throw new AppError('Failed to send workflow event', 500, 'WORKFLOW_ERROR');
    }
  }
}

export const sendBlogPostToReview = async (req: Request, id: string) => {
  await requireRole(req, "editor");
  try {
    await BlogPostService.updateStatus(id, "under review");
    await BlogPostService.sendEvent("blog-post.updated", { id });
  } catch (error) {
    throw handleError(error);
  }
};

export const revertBlogPostFromReview = async (req: Request, id: string) => {
  await requireRole(req, "editor");
  try {
    await BlogPostService.updateStatus(id, "draft");
    // Don't send event for revert to draft - no automation needed
  } catch (error) {
    throw handleError(error);
  }
};

export const approveBlogPostAiSuggestions = async (req: Request, id: string) => {
  await requireRole(req, "editor");
  console.log("Approving AI suggestions for blog post:", id);

  let validatedId: string | undefined;

  try {
    validatedId = validateInput(blogPostIdSchema, id);

    // Send the approval event to Inngest
    await BlogPostService.sendEvent("blog-post.approve-ai-suggestions", { id: validatedId });
    console.log("Approval event sent successfully");

    // Also update the database directly as a fallback
    const blogPost = await prisma.blogPost.findUnique({
      where: { id: Number(validatedId) }
    });

    if (blogPost?.markdownAiRevision) {
      await BlogPostService.updateStatus(validatedId, "published", {
        markdown: blogPost.markdownAiRevision as string,
      });
      console.log("Blog post approved and published directly");
    } else {
      throw new AppError("No AI revision found to approve", 404, "NO_REVISION_FOUND");
    }
  } catch (error) {
    logError(error as Error, { action: 'approveBlogPostAiSuggestions', id });

    // Fallback: try to approve directly without Inngest
    try {
      if (!validatedId) {
        validatedId = validateInput(blogPostIdSchema, id);
      }

      const blogPost = await prisma.blogPost.findUnique({
        where: { id: Number(validatedId) }
      });

      if (blogPost?.markdownAiRevision) {
        await BlogPostService.updateStatus(validatedId, "published", {
          markdown: blogPost.markdownAiRevision as string,
        });
        console.log("Blog post approved and published via fallback");
      } else {
        throw new AppError("No AI revision found to approve", 404, "NO_REVISION_FOUND");
      }
    } catch (fallbackError) {
      logError(fallbackError as Error, { action: 'approveBlogPostAiSuggestions_fallback', id: validatedId || id });
      throw new AppError("Failed to approve blog post. Please try again.", 500, "APPROVAL_FAILED");
    }
  }
};

export const publishBlogPost = async (req: Request, id: string) => {
  await requireRole(req, "editor");
  try {
    await BlogPostService.updateStatus(id, "published");
    await BlogPostService.sendEvent("blog-post.published", { id });
  } catch (error) {
    throw handleError(error);
  }
};

export const unpublishBlogPost = async (req: Request, id: string) => {
  await requireRole(req, "editor");
  try {
    await BlogPostService.updateStatus(id, "draft");
    await BlogPostService.sendEvent("blog-post.unpublished", { id });
  } catch (error) {
    throw handleError(error);
  }
};
export const updateWorkflow = async (req: Request, workflow: Workflow) => {
  await requireRole(req, "editor");
  try {
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: {
        workflow: workflow.workflow as any,
      },
    });
  } catch (error) {
    logError(error as Error, { action: 'updateWorkflow', workflowId: workflow.id });
    throw new DatabaseError('Failed to update workflow', error as Error);
  }
};

export const toggleWorkflow = async (req: Request, workflowId: number, enabled: boolean) => {
  await requireRole(req, "editor");
  try {
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        enabled,
      },
    });
  } catch (error) {
    logError(error as Error, { action: 'toggleWorkflow', workflowId, enabled });
    throw new DatabaseError('Failed to toggle workflow', error as Error);
  }
};

// User management service class
class UserService {
  static async updateUserRole(email: string, role: 'viewer' | 'editor' | 'admin') {
    try {
      const validatedData = validateInput(userRoleUpdateSchema, { email, role });

      const updatedUser = await prisma.user.update({
        where: { email: validatedData.email },
        data: { role: validatedData.role },
        select: { id: true, email: true, name: true, role: true }
      });

      return updatedUser;
    } catch (error) {
      logError(error as Error, { action: 'updateUserRole', email, role });
      throw new DatabaseError('Failed to update user role', error as Error);
    }
  }
}

export const updateUserRole = async (req: Request, email: string, role: 'viewer' | 'editor' | 'admin') => {
  await requireRole(req, "admin");
  try {
    return await UserService.updateUserRole(email, role);
  } catch (error) {
    throw handleError(error);
  }
};

// Stock factor analysis server action
export const createStockFactorTable = async (analysisResults: string, minPctChange: number = 4.0) => {
  try {
    console.log('Creating factor table from analysis results with minPctChange:', minPctChange);

    // Parse the analysis results to get transaction data
    const results = JSON.parse(analysisResults);

    if (!results.transactions || !Array.isArray(results.transactions)) {
      throw new Error('No transaction data found in analysis results');
    }

    // Create factor data from existing transactions
    const factorData = results.transactions.map((tx: any, index: number) => {
      // Extract factors from the transaction if available, otherwise create basic structure
      const factors = tx.factors || [];

      // Map existing factors to our factor structure
      const factorMap: Record<string, number | null> = {
        "volume_spike": factors.includes('volume_spike') ? 1 : 0,
        "break_ma50": factors.includes('break_ma50') ? 1 : 0,
        "break_ma200": factors.includes('break_ma200') ? 1 : 0,
        "rsi_over_60": factors.includes('rsi_over_60') ? 1 : 0,
        // AI-powered factors (null for now, will be populated by AI later)
        "market_up": null,
        "sector_up": null,
        "earnings_window": null,
        "news_positive": null,
        "short_covering": null,
        "macro_tailwind": null
      };

      return {
        "Tx": tx.tx || index + 1,
        "Date": tx.date,
        ...factorMap
      };
    });

    console.log(`Generated factor table with ${factorData.length} transactions`);

    return { success: true, data: factorData };
  } catch (error) {
    console.error('Error creating factor table:', error);
    throw new AppError('Failed to create factor table', 500, 'FACTOR_TABLE_ERROR');
  }
};

export const applyWorkflowToBlogPost = async (req: Request, blogPostId: string, workflowName: string) => {
  await requireRole(req, "editor");
  console.log(`🔄 Starting workflow application: ${workflowName} to blog post ${blogPostId}`);

  try {
    // Get the workflow template
    const { getWorkflowTemplate } = await import("@/lib/workflow-templates");
    const workflowTemplate = getWorkflowTemplate(workflowName);

    if (!workflowTemplate) {
      console.error(`❌ Workflow template "${workflowName}" not found`);
      throw new AppError(`Workflow template "${workflowName}" not found`, 404, 'WORKFLOW_NOT_FOUND');
    }

    console.log(`✅ Found workflow template: ${workflowTemplate.name} with trigger: ${workflowTemplate.trigger}`);

    // Check if workflow was already applied by checking the status and AI content
    const blogPost = await prisma.blogPost.findUnique({
      where: { id: Number(blogPostId) },
      select: {
        status: true,
        markdownAiRevision: true,
        aiPublishingRecommendations: true,
        markdown: true
      }
    });

    if (!blogPost) {
      throw new AppError(`Blog post ${blogPostId} not found`, 404, 'BLOG_POST_NOT_FOUND');
    }

    // Check if this specific workflow was already applied
    const isWorkflowAlreadyApplied = checkIfWorkflowAlreadyApplied(blogPost, workflowName);

    if (isWorkflowAlreadyApplied) {
      console.log(`⚠️ Workflow "${workflowName}" was already applied to blog post ${blogPostId}`);
      return {
        success: false,
        message: `Workflow "${workflowName}" was already applied to this blog post`,
        alreadyApplied: true
      };
    }

    // Update blog post status to trigger the workflow
    console.log(`📝 Updating blog post status to "workflow applied"...`);
    await BlogPostService.updateStatus(blogPostId, "workflow applied");
    console.log(`✅ Blog post status updated successfully`);

    // Send the specific workflow event based on the template
    let eventName = workflowTemplate.trigger;
    let eventData = {
      blogPostId,
      workflowName,
      timestamp: new Date().toISOString()
    };

    console.log(`📤 Sending event: ${eventName} with data:`, eventData);

    try {
      await BlogPostService.sendEvent(eventName, eventData);
      console.log(`✅ Event sent successfully: ${eventName}`);
    } catch (eventError) {
      // Log the event error but don't fail the entire operation
      console.warn('⚠️ Failed to send workflow event, but status was updated:', eventError);
      // Continue without failing - the status update is the important part
    }

    console.log(`🎉 Workflow "${workflowName}" applied to blog post ${blogPostId} successfully`);
    return { success: true, message: `Workflow "${workflowName}" applied successfully` };
  } catch (error) {
    console.error(`❌ Failed to apply workflow "${workflowName}":`, error);
    throw handleError(error);
  }
};

// Helper function to check if a workflow was already applied
function checkIfWorkflowAlreadyApplied(blogPost: any, workflowName: string): boolean {
  switch (workflowName) {
    case "blog-review-workflow":
      // Check if AI revision exists and status indicates review was done
      return !!(blogPost.markdownAiRevision &&
        (blogPost.status === "needs approval" ||
          blogPost.status === "under review" ||
          blogPost.status === "workflow applied"));

    case "social-media-workflow":
      // Check if social media content was generated
      return !!(blogPost.aiPublishingRecommendations &&
        blogPost.aiPublishingRecommendations.includes("Social Media Content Generated"));

    case "quick-publish-workflow":
      // Check if content was already published with AI improvements
      return !!(blogPost.status === "published" &&
        blogPost.markdown !== blogPost.markdownAiRevision &&
        blogPost.markdownAiRevision);

    default:
      return false;
  }
}
