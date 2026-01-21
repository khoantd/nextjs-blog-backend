import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import fs from 'fs';

// Determine if we're in production (compiled) or development
const isProduction = process.env.NODE_ENV === 'production';

// Set up server URLs - use environment variable or construct from PORT
const getServerUrl = () => {
    // Check for explicit API URL (for remote server)
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL;
    }
    // Check for PORT and construct URL
    if (process.env.PORT) {
        // Try to detect if we're on a remote server
        const port = process.env.PORT;
        // If PORT is 3050, likely remote server
        if (port === '3050' || port === '3001') {
            // Check if we can determine the hostname
            // For remote access, use the PORT to construct URL
            // In production, this should be set via NEXT_PUBLIC_API_URL
            return `http://localhost:${port}`;
        }
        return `http://localhost:${port}`;
    }
    // Default fallback
    return 'http://localhost:3001';
};

// Determine API file paths based on environment
// Check if dist directory exists (compiled) or use src (development)
const getApiPaths = () => {
    const distRoutesPath = path.join(process.cwd(), 'dist', 'routes');
    const srcRoutesPath = path.join(process.cwd(), 'src', 'routes');
    
    if (isProduction && fs.existsSync(distRoutesPath)) {
        // In production with compiled files
        return [
            path.join(process.cwd(), 'dist', 'routes', '*.js'),
            path.join(process.cwd(), 'dist', 'index.js'),
        ];
    }
    // In development or if dist doesn't exist, use src
    return [
        path.join(process.cwd(), 'src', 'routes', '*.ts'),
        path.join(process.cwd(), 'src', 'index.ts'),
    ];
};

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'NextJS Blog Backend API',
            version: '1.0.0',
            description: `API documentation for the NextJS Blog Backend with AI workflows.

## Authentication

This API supports two authentication methods:

1. **Bearer Token Authentication** (Recommended for API clients)
   - Include the token in the \`Authorization\` header: \`Authorization: Bearer <token>\`
   - The token must be a valid NextAuth JWT token signed with \`NEXTAUTH_SECRET\`
   - You can obtain a token by:
     - Using the \`/api/auth/dev-token\` endpoint (development only)
     - Extracting the session token from NextAuth cookies
     - Using a NextAuth session token directly

2. **Cookie-Based Authentication** (Used by web browsers)
   - Include NextAuth session cookies in the request
   - Cookie names: \`next-auth.session-token\` (development) or \`__Secure-next-auth.session-token\` (production)
   - Automatically handled by browsers when authenticated via NextAuth

**Note**: The authentication middleware checks Bearer tokens first, then falls back to cookies if no Bearer token is provided.

## Role-Based Access Control

The API implements role-based access control with three roles:
- **viewer** (default): Can view content
- **editor**: Can create and edit content, manage workflows
- **admin**: Full access including user management and deletion`,
        },
        servers: [
            {
                url: getServerUrl(),
                description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'NextAuth JWT token. Include as: Authorization: Bearer <token>. The token must be a valid NextAuth session token signed with NEXTAUTH_SECRET. You can obtain a token from /api/auth/dev-token (development only) or extract it from NextAuth session cookies.',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: getApiPaths(),
};

export const specs = swaggerJsdoc(options);
