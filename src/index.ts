import express from 'express'; // Trigger restart verification
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local' });
}

// Import routes
import authRoutes from './routes/auth';
import blogPostRoutes from './routes/blog-posts';
import stockAnalysisRoutes from './routes/stock-analyses';
import workflowRoutes from './routes/workflows';
import userRoutes from './routes/users';
import earningsRoutes from './routes/earnings';
import stockRoutes from './routes/stocks';
import watchlistRoutes from './routes/watchlists';
import { AuthenticationError, AuthorizationError } from './lib/auth-utils';

import { getToken, decode } from "next-auth/jwt";
import swaggerUi from 'swagger-ui-express';
import { specs } from './lib/swagger';
import { initializeDatabase } from './lib/migrate';

// JWT middleware for authentication
const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const cookieHeader = req.headers.cookie || '';
    const authHeader = req.headers.authorization || '';
    const hasNextAuthSecret = !!process.env.NEXTAUTH_SECRET;
    
    console.log("Auth middleware - Cookies present:", !!cookieHeader);
    console.log("Auth middleware - Authorization header present:", !!authHeader);
    console.log("Auth middleware - NEXTAUTH_SECRET:", hasNextAuthSecret ? "Set" : "Not set");
    
    if (!hasNextAuthSecret) {
      console.error("Auth middleware - NEXTAUTH_SECRET is not set!");
      (req as any).user = null;
      return next();
    }

    let token = null;
    let sessionTokenValue: string | null = null;

    // First, try Bearer token authentication
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerToken = authHeader.substring(7).trim();
      if (bearerToken) {
        try {
          console.log("Auth middleware - Attempting to decode Bearer token");
          const decoded = await decode({
            token: bearerToken,
            secret: process.env.NEXTAUTH_SECRET!,
          });
          if (decoded) {
            token = decoded as any;
            console.log("Auth middleware - Bearer token decoded successfully");
          }
        } catch (error: any) {
          console.log("Auth middleware - Bearer token decode failed:", error?.message || 'Unknown error');
        }
      }
    }

    // Parse cookies to see what we have (only if Bearer token didn't work)
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      const cookieNames = [
        'next-auth.session-token',
        '__Secure-next-auth.session-token',
      ];
      
      for (const cookieName of cookieNames) {
        const cookie = cookies.find(c => c.startsWith(`${cookieName}=`));
        if (cookie) {
          // Extract and URL-decode the cookie value
          const cookieValue = cookie.substring(cookieName.length + 1);
          sessionTokenValue = decodeURIComponent(cookieValue);
          console.log(`Auth middleware - Found ${cookieName} cookie`);
          break;
        }
      }
      
      if (!sessionTokenValue) {
        console.log("Auth middleware - No NextAuth session token found in cookies");
        // Log available cookie names for debugging
        const availableCookies = cookies.map(c => c.split('=')[0]);
        console.log("Auth middleware - Available cookies:", availableCookies);
      }
    }

    // Try to get token using getToken (only if Bearer token didn't work)
    if (!token) {
      // Create a request-like object that getToken expects
      // getToken from next-auth/jwt expects either a Next.js request or an object with headers
      // It also needs a cookies method for proper cookie parsing
      const requestForGetToken = {
        headers: {
          cookie: cookieHeader,
          ...req.headers,
        },
        url: req.url,
        method: req.method,
        // Add cookies method for NextAuth compatibility
        cookies: {
          get: (name: string) => {
            if (!cookieHeader) return undefined;
            const cookies = cookieHeader.split(';').map(c => c.trim());
            const cookie = cookies.find(c => c.startsWith(`${name}=`));
            if (cookie) {
              return decodeURIComponent(cookie.substring(name.length + 1));
            }
            return undefined;
          },
        },
      } as any;

      // First, try without explicit cookie name (auto-detect)
      try {
        token = await getToken({
          req: requestForGetToken,
          secret: process.env.NEXTAUTH_SECRET!,
          secureCookie: process.env.NODE_ENV === 'production',
        });
        if (token) {
          console.log("Auth middleware - Token found via auto-detect");
        }
      } catch (error: any) {
        console.log("Auth middleware - Auto-detect failed:", error?.message || 'Unknown error');
      }

      // If auto-detect failed, try both cookie names explicitly
      if (!token) {
        const cookieNames = [
          'next-auth.session-token',
          '__Secure-next-auth.session-token',
        ];
        
        for (const cookieName of cookieNames) {
          try {
            token = await getToken({
              req: requestForGetToken,
              secret: process.env.NEXTAUTH_SECRET!,
              secureCookie: cookieName.startsWith('__Secure-'),
              cookieName,
            });
            if (token) {
              console.log(`Auth middleware - Found token using cookie: ${cookieName}`);
              break;
            }
          } catch (error: any) {
            console.log(`Auth middleware - Failed to get token from ${cookieName}:`, error?.message || 'Unknown error');
            // Continue to next cookie name
            continue;
          }
        }
      }

      // If getToken failed but we have a session token value, try manual decode as fallback
      if (!token && sessionTokenValue) {
        try {
          console.log("Auth middleware - Attempting manual decode of session token");
          const decoded = await decode({
            token: sessionTokenValue,
            secret: process.env.NEXTAUTH_SECRET!,
          });
          if (decoded) {
            token = decoded as any;
            console.log("Auth middleware - Token decoded manually");
          }
        } catch (error: any) {
          console.log("Auth middleware - Manual decode failed:", error?.message || 'Unknown error');
        }
      }
    }

    if (token) {
      (req as any).user = {
        id: token.sub,
        email: token.email,
        name: token.name,
        role: token.role || 'viewer'
      };
      console.log("Auth middleware - User authenticated:", (req as any).user.email);
    } else {
      (req as any).user = null;
      console.log("Auth middleware - No user authenticated (no valid token found)");
      if (cookieHeader) {
        console.log("Auth middleware - Cookies were present but token extraction failed");
        // Log first 100 chars of cookie header for debugging (without sensitive data)
        const cookiePreview = cookieHeader.substring(0, 100);
        console.log("Auth middleware - Cookie preview:", cookiePreview);
      }
    }
  } catch (error: any) {
    console.error("JWT Verification Error:", error?.message || error);
    console.error("JWT Verification Error Stack:", error?.stack);
    (req as any).user = null;
  }
  next();
};

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
// Allow requests from frontend origin and also allow server-side requests (no origin)
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : ['http://localhost:3000'];
    
    // Allow requests with no origin (like server-side requests from Next.js API routes)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // Normalize origin for comparison (handle protocol variations)
    const normalizeOrigin = (url: string): string => {
      // Remove trailing slash
      return url.replace(/\/$/, '');
    };
    
    const normalizedOrigin = normalizeOrigin(origin);
    
    // Check if origin matches exactly
    if (allowedOrigins.some(allowed => normalizeOrigin(allowed) === normalizedOrigin)) {
      callback(null, true);
      return;
    }
    
    // Also check if origin matches with protocol swapped (http <-> https)
    // This handles cases where browser upgrades HTTP to HTTPS
    const protocolSwapped = normalizedOrigin.replace(/^https?:\/\//, (match) => {
      return match === 'http://' ? 'https://' : 'http://';
    });
    
    if (allowedOrigins.some(allowed => normalizeOrigin(allowed) === protocolSwapped)) {
      console.log(`CORS: Allowing origin ${origin} (protocol swapped from ${protocolSwapped})`);
      callback(null, true);
      return;
    }
    
    // Check if origin matches any allowed origin by hostname and port (ignoring protocol)
    // This handles cases where browser upgrades HTTP to HTTPS
    try {
      const originUrl = new URL(normalizedOrigin);
      const originHost = `${originUrl.hostname}${originUrl.port ? `:${originUrl.port}` : ''}`;
      
      const matchesByHost = allowedOrigins.some(allowed => {
        try {
          const allowedUrl = new URL(allowed);
          const allowedHost = `${allowedUrl.hostname}${allowedUrl.port ? `:${allowedUrl.port}` : ''}`;
          return allowedHost === originHost;
        } catch {
          return false;
        }
      });
      
      if (matchesByHost) {
        console.log(`CORS: Allowing origin ${origin} (matches hostname and port, protocol may differ)`);
        callback(null, true);
        return;
      }
    } catch (urlError) {
      // Invalid URL format, continue to rejection
      console.warn(`CORS: Invalid origin URL format: ${origin}`);
    }
    
    // In development, allow localhost origins with any protocol
    if (process.env.NODE_ENV !== 'production') {
      try {
        const originUrl = new URL(normalizedOrigin);
        if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
          console.log(`CORS: Allowing localhost origin ${origin} (development mode)`);
          callback(null, true);
          return;
        }
      } catch {
        // Invalid URL, continue to rejection
      }
    }
    
    console.warn(`CORS: Blocked request from origin: ${origin}`);
    console.warn(`CORS: Allowed origins: ${allowedOrigins.join(', ')}`);
    console.warn(`CORS: To allow this origin, set CORS_ORIGIN environment variable to include: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie']
};

app.use(cors(corsOptions));

// Helmet configuration to allow Swagger UI's inline styles and scripts
// Note: We disable upgrade-insecure-requests for Swagger UI to work on HTTP servers
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Remove upgrade-insecure-requests to allow HTTP resources (needed for HTTP-only servers)
      "upgrade-insecure-requests": null,
      "img-src": ["'self'", "data:", "http:", "https:", "https://validator.swagger.io"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "http:", "https:"],
      "style-src": ["'self'", "http:", "https:", "'unsafe-inline'"],
      "font-src": ["'self'", "data:", "http:", "https:"],
      "connect-src": ["'self'", "http:", "https:"],
      "frame-src": ["'self'"],
    },
  },
};

app.use(helmet(helmetConfig));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * @openapi
 * /health:
 *   get:
 *     description: Get server health status
 *     responses:
 *       200:
 *         description: Returns status ok and timestamp
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Swagger documentation route with dynamic server URL
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', (req, res, next) => {
  // Dynamically set server URL based on request
  const protocol = req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  const baseUrl = `${protocol}://${host}`;
  
  // Clone specs and update server URL
  const swaggerSpec = JSON.parse(JSON.stringify(specs));
  if (swaggerSpec.servers && swaggerSpec.servers.length > 0) {
    swaggerSpec.servers[0].url = baseUrl;
    swaggerSpec.servers[0].description = 'Current server';
  } else {
    swaggerSpec.servers = [{ url: baseUrl, description: 'Current server' }];
  }
  
  swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'NextJS Blog Backend API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
      // Enable Bearer token authentication in Swagger UI
      // Users can click "Authorize" button and enter their Bearer token
    },
  })(req, res, next);
});

// Request logging middleware for debugging route matching
app.use((req, res, next) => {
  if (req.path.startsWith('/api/users')) {
    console.log(`[Route Debug] ${req.method} ${req.path} - Original URL: ${req.originalUrl}`);
  }
  next();
});

// Public API routes (no authentication required)
// Register /api/users/by-email as public endpoint for auth role lookup
// Auto-creates user if they don't exist (for NextAuth users syncing)
// Supports both GET (query params) and POST (body) for flexibility
// IMPORTANT: This route must be registered BEFORE app.use('/api/users', ...) to take precedence
app.get('/api/users/by-email', async (req, res) => {
  console.log(`[User Sync] 🎯 Route handler hit for /api/users/by-email`);
  console.log(`[User Sync] Request method: ${req.method}, URL: ${req.url}`);
  console.log(`[User Sync] Query params:`, req.query);
  try {
    const { email, name, image } = req.query;
    console.log(`[User Sync] 📧 Received request for email: ${email}`);

    if (!email || typeof email !== 'string') {
      console.warn(`[User Sync] ⚠️ Invalid email parameter:`, email);
      return res.status(400).json({ error: "Email parameter is required" });
    }

    const { prisma } = await import('./lib/prisma');
    console.log(`[User Sync] 🔍 Looking up user: ${email}`);
    
    let user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
      },
    });

    // Auto-create user if they don't exist (for NextAuth user sync)
    if (!user) {
      console.log(`[User Sync] 👤 User ${email} not found, creating with default role...`);
      
      // Determine default role based on environment variables
      const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
      const adminDomains = process.env.ADMIN_DOMAINS?.split(',').map(d => d.trim()) || [];
      
      const isAdmin = adminEmails.includes(email) || 
                     adminDomains.some(domain => email.endsWith(`@${domain}`));
      const defaultRole = isAdmin ? 'admin' : 'viewer';
      
      console.log(`[User Sync] 🎭 Assigning role: ${defaultRole} (isAdmin: ${isAdmin})`);
      
      try {
        user = await prisma.user.create({
          data: {
            email,
            name: typeof name === 'string' ? name : null,
            image: typeof image === 'string' ? image : null,
            role: defaultRole,
          },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
          },
        });
        console.log(`[User Sync] ✅ Created user ${email} with role: ${defaultRole}`);
      } catch (createError: any) {
        // If creation fails (e.g., race condition, unique constraint), try to fetch again
        console.error(`[User Sync] ⚠️ Failed to create user (${createError?.code || 'unknown'}):`, createError?.message);
        console.log(`[User Sync] 🔄 Retrying fetch for user: ${email}`);
        
        user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
          },
        });
        
        if (!user) {
          console.error(`[User Sync] ❌ Failed to create or find user ${email} after retry`);
          return res.status(500).json({ 
            error: "Failed to create user",
            details: process.env.NODE_ENV === 'development' ? createError?.message : undefined
          });
        } else {
          console.log(`[User Sync] ✅ Found user after retry: ${email} (role: ${user.role})`);
        }
      }
    } else {
      // Update name/image if provided and different (for OAuth profile sync)
      const updateData: { name?: string | null; image?: string | null } = {};
      if (typeof name === 'string' && name !== user.name) {
        updateData.name = name;
      }
      if (typeof image === 'string' && image !== user.image) {
        updateData.image = image;
      }
      
      if (Object.keys(updateData).length > 0) {
        console.log(`[User Sync] 🔄 Updating user profile data for ${email}`);
        user = await prisma.user.update({
          where: { email },
          data: updateData,
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
          },
        });
        console.log(`[User Sync] ✅ Updated user profile: ${email}`);
      } else {
        console.log(`[User Sync] ✅ Found existing user: ${email} (role: ${user.role})`);
      }
    }

    return res.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error("[User Sync] ❌ Error fetching user by email:", {
      error: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return res.status(500).json({ 
      error: "Failed to fetch user",
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// POST endpoint for /api/users/by-email (for OAuth profile data sync)
app.post('/api/users/by-email', async (req, res) => {
  try {
    const { email, name, image } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: "Email is required" });
    }

    const { prisma } = await import('./lib/prisma');
    
    let user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
      },
    });

    if (!user) {
      // Determine default role
      const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
      const adminDomains = process.env.ADMIN_DOMAINS?.split(',').map(d => d.trim()) || [];
      const isAdmin = adminEmails.includes(email) || 
                     adminDomains.some(domain => email.endsWith(`@${domain}`));
      const defaultRole = isAdmin ? 'admin' : 'viewer';
      
      user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          image: image || null,
          role: defaultRole,
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
        },
      });
    } else {
      // Update profile data if provided
      const updateData: { name?: string | null; image?: string | null } = {};
      if (name !== undefined && name !== user.name) {
        updateData.name = name || null;
      }
      if (image !== undefined && image !== user.image) {
        updateData.image = image || null;
      }
      
      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({
          where: { email },
          data: updateData,
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
          },
        });
      }
    }

    return res.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error("[User Sync] ❌ Error in POST /api/users/by-email:", error);
    return res.status(500).json({ 
      error: "Failed to sync user",
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// API routes
// Apply authentication middleware to protected routes
app.use('/api/blog-posts', authenticateToken, blogPostRoutes);
app.use('/api/stock-analyses', authenticateToken, stockAnalysisRoutes);
app.use('/api/workflows', authenticateToken, workflowRoutes);
app.use('/api/watchlists', authenticateToken, watchlistRoutes);

// CRITICAL: Register /api/users router AFTER the specific /api/users/by-email route
// This ensures the specific route matches first
// The route handler above (line 325) must remain before this line
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/earnings', authenticateToken, earningsRoutes);
app.use('/api/stocks', authenticateToken, stockRoutes);

// Public auth routes (handled by frontend NextAuth)
// Log when auth routes are registered
console.log('[Routes] Registering auth routes at /api/auth');
app.use('/api/auth', (req, res, next) => {
  console.log(`[Auth Routes] ${req.method} ${req.path} - Original URL: ${req.originalUrl}`);
  next();
}, authRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);

  // Handle custom authentication and authorization errors
  if (err instanceof AuthenticationError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        status: err.statusCode,
        timestamp: new Date().toISOString()
      }
    });
  }

  if (err instanceof AuthorizationError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        status: err.statusCode,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Handle other errors
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500,
      timestamp: new Date().toISOString()
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log(`[404] Route not found: ${req.method} ${req.originalUrl}`);
  console.log(`[404] Available routes: /api/auth/register, /api/auth/login, /api/auth/dev-token, /api/auth/providers`);
  res.status(404).json({
    message: 'Route not found',
    status: 404,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  });
});

// Initialize database (run migrations if enabled)
let server: any;
initializeDatabase().then(() => {
  // Start server after database initialization
  startServer();
}).catch((error) => {
  console.error('❌ Failed to initialize database:', error);
  console.error('💡 Continuing startup, but database operations may fail');
  startServer();
});

function startServer() {
  server = app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📚 Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    const autoMigrateEnabled = process.env.RUN_MIGRATIONS === 'true' || process.env.AUTO_MIGRATE === 'true' || process.env.AUTO_MIGRATE === '1';
    console.log(`🔄 Auto-migrate: ${autoMigrateEnabled ? 'enabled' : 'disabled'}`);
  }).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.error(`💡 To fix this, run one of the following commands:`);
      console.error(`   - Kill process on port ${PORT}: lsof -ti:${PORT} | xargs kill -9`);
      console.error(`   - Or find and kill manually: lsof -i:${PORT}`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    console.log('HTTP server closed.');

    try {
      const { prisma } = await import('./lib/prisma');
      await prisma.$disconnect();
      console.log('Database connection closed.');
      process.exit(0);
    } catch (err) {
      console.error('Error during database disconnection:', err);
      process.exit(1);
    }
  });

  // Force shutdown after 10s if graceful fails
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default app;
