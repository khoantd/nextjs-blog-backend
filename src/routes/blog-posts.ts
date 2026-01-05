import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getCurrentUser } from '../lib/auth-utils';
import { canCreatePost, canViewPosts } from '../lib/auth';
import { getPaginationOptions, formatPaginatedResponse } from '../lib/pagination';

const router = Router();

/**
 * @openapi
 * /api/blog-posts:
 *   get:
 *     summary: Fetch all blog posts
 *     tags: [Blog Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: A paginated list of blog posts
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check if user has permission to view blog posts
    if (!canViewPosts(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions to view posts" });
    }

    const paginationOptions = getPaginationOptions(req);

    const [blogPosts, total] = await Promise.all([
      prisma.blogPost.findMany({
        orderBy: {
          createdAt: "desc",
        },
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
      }),
      prisma.blogPost.count(),
    ]);

    return res.json({
      data: formatPaginatedResponse(blogPosts, total, paginationOptions)
    });
  } catch (error) {
    console.error("Error fetching blog posts:", error);
    return res.status(500).json({ error: "Failed to fetch blog posts" });
  }
});

/**
 * @openapi
 * /api/blog-posts:
 *   post:
 *     summary: Create a new blog post
 *     tags: [Blog Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - markdown
 *             properties:
 *               title:
 *                 type: string
 *               subtitle:
 *                 type: string
 *               markdown:
 *                 type: string
 *     responses:
 *       201:
 *         description: Blog post created successfully
 *       400:
 *         description: Title and content are required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions to create posts
 */
router.post('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canCreatePost(user.role)) {
      return res.status(403).json({ error: "Forbidden - Insufficient permissions to create posts" });
    }

    const { title, subtitle, markdown } = req.body;

    if (!title || !markdown) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const blogPost = await prisma.blogPost.create({
      data: {
        title,
        subtitle: subtitle || null,
        markdown,
        status: "draft",
      },
    });

    return res.status(201).json({ data: { blogPost } });
  } catch (error) {
    console.error("Error creating blog post:", error);
    return res.status(500).json({ error: "Failed to create blog post" });
  }
});

export default router;
