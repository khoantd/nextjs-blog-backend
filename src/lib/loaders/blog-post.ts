import { prisma } from "../prisma";
import { BlogPost } from "../types";

export async function loadBlogPost(id: string): Promise<BlogPost> {
  if (!id) {
    throw new Error('Blog post ID is required');
  }
  
  // Check if the ID looks like a static file request
  if (id.includes('.') || id.includes('/') || id.includes('\\')) {
    throw new Error('Invalid blog post ID format');
  }
  
  const parsedId = parseInt(id);
  if (isNaN(parsedId) || parsedId <= 0) {
    throw new Error(`Invalid blog post ID: ${id}`);
  }

  const blogPost = await prisma.blogPost.findUnique({
    where: {
      id: parsedId,
    },
  });

  if (!blogPost) {
    throw new Error(`Blog post #${id} not found`);
  }

  return blogPost as BlogPost;
}
