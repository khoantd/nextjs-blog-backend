import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getCurrentUser } from '../lib/auth-utils';
import { canManageUsers } from '../lib/auth';
import { userRoleUpdateSchema } from '../lib/validation';
import { getPaginationOptions, formatPaginatedResponse } from '../lib/pagination';

const router = Router();

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Fetch all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: A list of users
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Requires Admin role
 */
router.get('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canManageUsers(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions to manage users" });
    }

    const paginationOptions = getPaginationOptions(req);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
      }),
      prisma.user.count(),
    ]);

    return res.json({
      data: formatPaginatedResponse(users, total, paginationOptions)
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

/**
 * @openapi
 * /api/users/role:
 *   put:
 *     summary: Update user role (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [viewer, editor, admin]
 *     responses:
 *       200:
 *         description: User role updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Requires Admin role
 */
router.put('/role', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canManageUsers(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions to update user roles" });
    }

    const { email, role } = req.body;

    // Validate input
    const validation = userRoleUpdateSchema.safeParse({ email, role });
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid input",
        details: validation.error.issues
      });
    }

    const updatedUser = await prisma.user.update({
      where: { email: validation.data.email },
      data: { role: validation.data.role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    return res.json({ data: { user: updatedUser } });
  } catch (error) {
    console.error("Error updating user role:", error);
    return res.status(500).json({ error: "Failed to update user role" });
  }
});

export default router;
