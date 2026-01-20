import { Router } from 'express';
import { encode } from 'next-auth/jwt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import { registerSchema, loginSchema, setPasswordSchema, validateInput } from '../lib/validation';

const router = Router();

// Test route to verify router is working
router.get('/test', (req, res) => {
  res.json({ message: 'Auth router is working', timestamp: new Date().toISOString() });
});

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
  // if (process.env.NODE_ENV === 'production') {
  //   return res.status(403).json({ error: "Not available in production" });
  // }

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

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user with email/password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid input or user already exists
 *       500:
 *         description: Server error
 */
router.post('/register', async (req, res) => {
  console.log('[Auth Router] ✅ POST /register route handler called');
  console.log('[Auth Router] Request details:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    url: req.url
  });
  console.log('[Auth] POST /api/auth/register - Request received');
  console.log('[Auth] Request body:', { email: req.body?.email, hasPassword: !!req.body?.password, hasName: !!req.body?.name });
  try {
    // Validate input
    const validatedData = validateInput(registerSchema, req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: 'User already exists',
        message: 'An account with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(validatedData.password);

    // Determine default role based on environment variables
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
    const adminDomains = process.env.ADMIN_DOMAINS?.split(',').map(d => d.trim()) || [];
    
    const isAdmin = adminEmails.includes(validatedData.email) || 
                   adminDomains.some(domain => validatedData.email.endsWith(`@${domain}`));
    const defaultRole = isAdmin ? 'admin' : 'viewer';

    // Create user
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        password: hashedPassword,
        name: validatedData.name || null,
        role: defaultRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      data: {
        user,
        message: 'User registered successfully'
      }
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    
    if (error.message?.includes('Validation failed')) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: error.message
      });
    }

    return res.status(500).json({ 
      error: 'Failed to register user',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Login with email/password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/login', async (req, res) => {
  console.log('[Auth] POST /api/auth/login - Request received');
  console.log('[Auth] Request body:', { email: req.body?.email, hasPassword: !!req.body?.password });
  try {
    // Validate input
    const validatedData = validateInput(loginSchema, req.body);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
        image: true,
      },
    });

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check if user has a password set
    if (!user.password) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'No password set for this account. Please set a password first or sign in with Google.'
      });
    }

    // Verify password
    const isValidPassword = await verifyPassword(validatedData.password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Return user data (without password)
    const { password, ...userWithoutPassword } = user;

    return res.json({
      data: {
        user: userWithoutPassword,
        message: 'Login successful'
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    
    if (error.message?.includes('Validation failed')) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: error.message
      });
    }

    return res.status(500).json({ 
      error: 'Failed to login',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @openapi
 * /api/auth/set-password:
 *   post:
 *     summary: Set password for OAuth user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               confirmPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password set successfully
 *       400:
 *         description: Invalid input or user not found
 *       500:
 *         description: Server error
 */
router.post('/set-password', async (req, res) => {
  console.log('[Auth] POST /api/auth/set-password - Request received');
  console.log('[Auth] Request body:', { email: req.body?.email, hasPassword: !!req.body?.password });
  try {
    // Validate input
    const validatedData = validateInput(setPasswordSchema, req.body);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'No account found with this email address'
      });
    }

    // Check if user already has a password
    if (user.password) {
      return res.status(400).json({ 
        error: 'Password already set',
        message: 'This account already has a password. Use the change password feature to update it.'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(validatedData.password);

    // Update user with password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    return res.json({
      data: {
        message: 'Password set successfully'
      }
    });
  } catch (error: any) {
    console.error('Set password error:', error);
    
    if (error.message?.includes('Validation failed')) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: error.message
      });
    }

    return res.status(500).json({ 
      error: 'Failed to set password',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @openapi
 * /api/auth/password-status:
 *   get:
 *     summary: Check if user has password set
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *     responses:
 *       200:
 *         description: Password status retrieved
 *       400:
 *         description: Invalid email
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/password-status', async (req, res) => {
  console.log('[Auth] GET /api/auth/password-status - Request received');
  const email = req.query.email as string;

  if (!email) {
    return res.status(400).json({ 
      error: 'Email is required',
      message: 'Please provide an email address'
    });
  }

  try {
    // Validate email format
    const emailSchema = z.string().email('Invalid email address');
    emailSchema.parse(email);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'No account found with this email address'
      });
    }

    const hasPassword = !!user.password;
    const requiresPassword = !hasPassword;

    return res.json({
      data: {
        hasPassword,
        requiresPassword,
        email: user.email,
      }
    });
  } catch (error: any) {
    console.error('Password status error:', error);
    
    if (error.message?.includes('Invalid email')) {
      return res.status(400).json({ 
        error: 'Invalid email',
        message: error.message
      });
    }

    return res.status(500).json({ 
      error: 'Failed to check password status',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
