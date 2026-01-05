import { prisma } from "./prisma";

// Function to detect which workflows have been applied to a blog post
export async function getAppliedWorkflows(blogPostId: string): Promise<string[]> {
  const blogPost = await prisma.blogPost.findUnique({
    where: { id: Number(blogPostId) },
    select: { 
      status: true, 
      markdownAiRevision: true, 
      aiPublishingRecommendations: true,
      markdown: true
    }
  });

  if (!blogPost) return [];

  const appliedWorkflows: string[] = [];

  // Check for Blog Review Workflow
  if (blogPost.markdownAiRevision && 
      (blogPost.status === "needs approval" || 
       blogPost.status === "under review" || 
       blogPost.status === "workflow applied")) {
    appliedWorkflows.push("blog-review-workflow");
  }

  // Check for Social Media Workflow
  if (blogPost.aiPublishingRecommendations && 
      blogPost.aiPublishingRecommendations.includes("Social Media Content Generated")) {
    appliedWorkflows.push("social-media-workflow");
  }

  // Check for Quick Publish Workflow
  if (blogPost.status === "published" && 
      blogPost.markdown !== blogPost.markdownAiRevision &&
      blogPost.markdownAiRevision) {
    appliedWorkflows.push("quick-publish-workflow");
  }

  return appliedWorkflows;
}
