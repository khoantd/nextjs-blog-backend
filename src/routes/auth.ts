import { Router } from 'express';
import { encode } from 'next-auth/jwt';

const router = Router();

/**
 * @openapi
 * /api/auth/dev-token:
 *   get:
 *     summary: Generate a development JWT token (Dev only)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: A valid JWT token for testing
 *       403:
 *         description: Forbidden (Non-development environment)
 */
router.get('/dev-token', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: "Not available in production" });
  }

  try {
    const token = await encode({
      token: {
        sub: 'dev-user-id',
        email: 'admin@example.com',
        name: 'Dev Admin',
        role: 'admin'
      },
      secret: process.env.NEXTAUTH_SECRET!,
    });

    res.json({ token });
  } catch (error) {
    console.error("Error generating dev token:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

router.get('/providers', (req, res) => {
  res.json({
    providers: {
      google: {
        id: 'google',
        name: 'Google',
        type: 'oauth',
        signinUrl: '/api/auth/signin/google',
        callbackUrl: '/api/auth/callback/google'
      }
    }
  });
});

export default router;
