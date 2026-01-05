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
import { AuthenticationError, AuthorizationError } from './lib/auth-utils';

import { getToken } from "next-auth/jwt";
import swaggerUi from 'swagger-ui-express';
import { specs } from './lib/swagger';

// JWT middleware for authentication
const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (token) {
      (req as any).user = {
        id: token.sub,
        email: token.email,
        name: token.name,
        role: token.role || 'viewer'
      };
    } else {
      (req as any).user = null;
    }
  } catch (error) {
    console.error("JWT Verification Error:", error);
    (req as any).user = null;
  }
  next();
};

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Helmet configuration to allow Swagger UI's inline styles and scripts
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "https://validator.swagger.io"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "style-src": ["'self'", "https:", "'unsafe-inline'"],
      },
    },
  })
);

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

// Swagger documentation route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// API routes
// Apply authentication middleware to protected routes
app.use('/api/blog-posts', authenticateToken, blogPostRoutes);
app.use('/api/stock-analyses', authenticateToken, stockAnalysisRoutes);
app.use('/api/workflows', authenticateToken, workflowRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/earnings', authenticateToken, earningsRoutes);
app.use('/api/stocks', authenticateToken, stockRoutes);

// Public auth routes (handled by frontend NextAuth)
app.use('/api/auth', authRoutes);

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
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404,
      timestamp: new Date().toISOString()
    }
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

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
