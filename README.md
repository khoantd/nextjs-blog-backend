# Next.js Blog Backend

This is the backend API service for the Next.js Blog CMS with AI workflows. It provides RESTful APIs for blog management, stock analysis, user authentication, and workflow automation.

## Features

- **Blog Management**: CRUD operations for blog posts with AI-powered content processing
- **Stock Analysis**: Technical analysis with AI insights and factor tables
- **User Authentication**: Google OAuth with role-based access control (RBAC)
- **Workflow Automation**: Inngest-powered AI workflows for content processing
- **Earnings Data**: Stock earnings tracking with AI analysis

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: SQLite with Prisma ORM
- **Authentication**: NextAuth.js with Google OAuth
- **AI Integration**: LiteLLM proxy for multiple AI providers
- **Workflows**: Inngest for automation
- **Validation**: Zod schemas
- **Security**: Helmet, CORS, Rate limiting

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- SQLite

### Installation

1. Clone the repository:
   \`\`\`bash
   git clone <repository-url>
   cd nextjs-blog-backend
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Set up environment variables:
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your configuration
   \`\`\`

4. Set up the database:
   \`\`\`bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   \`\`\`

5. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

The server will start on \`http://localhost:3001\`.

## API Documentation

**📚 Complete API Reference:** See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for detailed endpoint documentation with request/response examples, authentication requirements, and error codes.

**🔧 Interactive API Docs:** Visit `/api-docs` when the server is running for Swagger UI documentation.

### Quick Reference

#### Authentication
- `GET /api/auth/providers` - Available auth providers
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/set-password` - Set password for OAuth users
- `GET /api/auth/password-status` - Check password status

#### Blog Posts
- `GET /api/blog-posts` - Get all blog posts (paginated)
- `POST /api/blog-posts` - Create a new blog post

#### Stock Analysis
- `GET /api/stock-analyses` - Get all stock analyses (paginated)
- `POST /api/stock-analyses` - Create a new stock analysis
- `GET /api/stock-analyses/:id` - Get specific stock analysis
- `POST /api/stock-analyses/:id/upload` - Upload CSV file
- `POST /api/stock-analyses/:id/analyze` - Trigger full analysis
- `GET /api/stock-analyses/:id/daily-scores` - Get daily scoring data
- `GET /api/stock-analyses/:id/predictions` - Get market predictions
- `POST /api/stock-analyses/:id/fetch-historical` - Fetch historical data
- `POST /api/stock-analyses/:id/fetch-vnstock-csv` - Fetch VN stock data
- `DELETE /api/stock-analyses/:id` - Delete stock analysis (admin only)

#### Earnings
- `GET /api/earnings` - Get all earnings data (paginated)
- `POST /api/earnings` - Create new earnings data
- `POST /api/earnings/sync` - Sync from Alpha Vantage
- `POST /api/earnings/analyze` - Trigger AI analysis
- `GET /api/earnings/:symbol` - Get earnings for symbol

#### Stocks
- `GET /api/stocks/price` - Get latest stock price

#### Users
- `GET /api/users` - Get all users (admin only)
- `PUT /api/users/role` - Update user role (admin only)
- `GET /api/users/by-email` - Get user by email (public, auto-creates)

#### Workflows
- `GET /api/workflows` - Get all workflows
- `POST /api/workflows` - Create a new workflow
- `PUT /api/workflows/:id` - Update a workflow

## Environment Variables

See \`.env.example\` for required environment variables:

### Required Variables
- \`DATABASE_URL\` - SQLite database path (e.g., `file:/app/data/prod.db`)
- \`NEXTAUTH_SECRET\` - NextAuth secret key
- \`NEXTAUTH_URL\` - Backend URL
- \`GOOGLE_CLIENT_ID\` - Google OAuth client ID
- \`GOOGLE_CLIENT_SECRET\` - Google OAuth client secret
- \`OPENAI_API_KEY\` - OpenAI API key
- \`LITELLM_API_KEY\` - LiteLLM API key
- \`LITELLM_BASE_URL\` - LiteLLM base URL
- \`INNGEST_EVENT_KEY\` - Inngest event key
- \`INNGEST_SIGNING_KEY\` - Inngest signing key
- \`PORT\` - Server port (default: 3001)
- \`CORS_ORIGIN\` - Frontend URL for CORS

### Optional Variables
- \`RUN_MIGRATIONS\` or \`AUTO_MIGRATE\` - Set to `true` or `1` to automatically run database migrations on startup. Useful for Docker deployments and production environments. Default: `false`

## Database Schema

The application uses Prisma with SQLite. See \`prisma/schema.prisma\` for the complete schema including:

- \`BlogPost\` - Blog posts with AI revisions
- \`User\` - User accounts with roles
- \`Workflow\` - Automation workflows
- \`StockAnalysis\` - Stock analysis data
- \`DailyFactorData\` - Technical indicators
- \`DailyScore\` - Daily scoring data
- \`FactorTable\` - Factor analysis tables
- \`EarningsData\` - Stock earnings data

## Deployment

### Docker

#### Method 1: Using Docker Compose (Recommended)

1. Build and start containers:
   \`\`\`bash
   docker-compose build
   docker-compose up -d
   \`\`\`

   Or build and start in one command:
   \`\`\`bash
   docker-compose up -d --build
   \`\`\`

2. View logs:
   \`\`\`bash
   docker-compose logs -f backend
   \`\`\`

3. Stop containers:
   \`\`\`bash
   docker-compose down
   \`\`\`

#### Method 2: Using Build Script

1. Build locally:
   \`\`\`bash
   npm run docker:build
   # Or directly:
   ./scripts/build-docker.sh
   \`\`\`

2. Build for production:
   \`\`\`bash
   npm run docker:build:prod
   # Or:
   ./scripts/build-docker.sh --tag production
   \`\`\`

3. Build for multiple platforms:
   \`\`\`bash
   npm run docker:build:multi
   # Or:
   ./scripts/build-docker.sh --platform linux/amd64,linux/arm64
   \`\`\`

4. Build and push to registry:
   \`\`\`bash
   ./scripts/build-docker.sh --registry docker.io/yourusername --tag v1.0.0 --push
   # Or for GitHub Container Registry:
   ./scripts/build-docker.sh --registry ghcr.io/yourorg --tag latest --push
   \`\`\`

#### Method 3: Using Docker Directly

1. Build the image:
   \`\`\`bash
   docker build -t nextjs-blog-backend:latest .
   \`\`\`

2. Run the container:
   \`\`\`bash
   docker run -d \\
     --name nextjs-blog-backend \\
     -p 3001:3001 \\
     -e DATABASE_URL=file:/app/data/prod.db \\
     -e NODE_ENV=production \\
     -e PORT=3001 \\
     -v backend-data:/app/data \\
     nextjs-blog-backend:latest
   \`\`\`

#### Build Script Options

The build script (`./scripts/build-docker.sh`) supports:
- \`--platform PLATFORM\` - Target platform (e.g., linux/amd64, linux/arm64)
- \`--registry REGISTRY\` - Docker registry (e.g., docker.io/username)
- \`--tag TAG\` - Image tag (default: latest)
- \`--push\` - Push to registry after building
- \`--dev\` - Use development Dockerfile
- \`-h, --help\` - Show help message

Examples:
\`\`\`bash
# Build for local use
./scripts/build-docker.sh

# Build and tag for production
./scripts/build-docker.sh --tag production

# Build for ARM64 and push to Docker Hub
./scripts/build-docker.sh --platform linux/arm64 --registry docker.io/myuser --tag v1.0.0 --push

# Build for multiple platforms
./scripts/build-docker.sh --platform linux/amd64,linux/arm64
\`\`\`

### Manual Deployment

1. Build the application:
   \`\`\`bash
   npm run build
   \`\`\`

2. Set production environment variables

3. Run database migrations (choose one method):
   
   **Option A: Automatic migrations on startup** (Recommended for Docker/production):
   \`\`\`bash
   # Set environment variable to enable auto-migration
   export RUN_MIGRATIONS=true
   # or
   export AUTO_MIGRATE=true
   \`\`\`
   
   **Option B: Manual migration**:
   \`\`\`bash
   npm run db:migrate:deploy
   \`\`\`

4. Start the server:
   \`\`\`bash
   npm start
   \`\`\`
   
   If \`RUN_MIGRATIONS=true\` or \`AUTO_MIGRATE=true\` is set, migrations will run automatically on startup.

## Scripts

- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm run start\` - Start production server
- \`npm run db:generate\` - Generate Prisma client
- \`npm run db:migrate\` - Run database migrations
- \`npm run db:seed\` - Seed database with sample data
- \`npm run db:studio\` - Open Prisma Studio
- \`npm run lint\` - Run ESLint
- \`npm run test\` - Run tests

## Security

- Helmet.js for security headers
- CORS configuration for cross-origin requests
- Rate limiting to prevent abuse
- Role-based access control (RBAC)
- Input validation with Zod schemas
- Environment variable protection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
