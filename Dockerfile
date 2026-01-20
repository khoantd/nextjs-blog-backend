FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Install build dependencies for native modules (sqlite3, bcryptjs, etc.)
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci && \
    npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# Copy only necessary files for build
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY prisma ./prisma
# Copy src directory - includes route handlers (e.g., /api/users/by-email)
# IMPORTANT: Route registration order in src/index.ts must be maintained:
#   - Public routes (like /api/users/by-email) must be registered BEFORE
#     authenticated routers (like /api/users) to ensure proper route matching
COPY src ./src

# Generate Prisma client and build the application
RUN npm run db:generate && \
    npm run build

# Production image, copy only what's needed
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create user and group in single layer
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 backend

# Copy package files for production install
COPY package.json package-lock.json* ./

# Copy Prisma schema and migrations (needed for migrations and client generation)
COPY --from=builder /app/prisma ./prisma

# Install ONLY production dependencies and clean up aggressively
RUN npm ci --omit=dev --ignore-scripts && \
    npm run db:generate && \
    # Remove unnecessary files from node_modules
    find node_modules -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "*.test.js" -o -name "*.test.ts" -o -name "examples" -o -name "docs" -o -name ".github" \) -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type f \( -name "*.map" -o -name "*.ts" -o -name "*.tsx" -o -name "*.md" -o -name "*.txt" -o -name "CHANGELOG*" -o -name "LICENSE*" -o -name "README*" -o -name "*.d.ts.map" \) -delete 2>/dev/null || true && \
    # Clean npm cache and temporary files
    npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/* /root/.npm

# Copy the built application
COPY --from=builder /app/dist ./dist

# Copy server.js wrapper (needed for tsconfig-paths resolution)
COPY server.js ./server.js

# Copy startup script
COPY scripts/start.sh ./scripts/start.sh

# Create necessary directories and set permissions in single layer
RUN mkdir -p /app/data /app/uploads /app/scripts && \
    chmod +x /app/scripts/start.sh && \
    chown -R backend:nodejs /app

USER backend

EXPOSE 3001

ENV PORT=3001
ENV DATABASE_URL=file:/app/data/prod.db
# Enable automatic migrations on startup (set to "false" to disable)
ENV RUN_MIGRATIONS=true

CMD ["/app/scripts/start.sh"]
