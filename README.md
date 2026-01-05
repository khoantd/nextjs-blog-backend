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

## API Endpoints

### Authentication
- \`GET /api/auth/providers\` - Available auth providers

### Blog Posts
- \`GET /api/blog-posts\` - Get all blog posts
- \`POST /api/blog-posts\` - Create a new blog post

### Stock Analysis
- \`GET /api/stock-analyses\` - Get all stock analyses
- \`POST /api/stock-analyses\` - Create a new stock analysis
- \`GET /api/stock-analyses/:id\` - Get a specific stock analysis

### Workflows
- \`GET /api/workflows\` - Get all workflows
- \`POST /api/workflows\` - Create a new workflow
- \`PUT /api/workflows/:id\` - Update a workflow

### Users
- \`GET /api/users\` - Get all users (admin only)
- \`PUT /api/users/role\` - Update user role (admin only)

### Earnings
- \`GET /api/earnings\` - Get all earnings data
- \`POST /api/earnings\` - Create new earnings data

## Environment Variables

See \`.env.example\` for required environment variables:

- \`DATABASE_URL\` - SQLite database path
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

1. Build the Docker image:
   \`\`\`bash
   docker build -t nextjs-blog-backend .
   \`\`\`

2. Run with Docker Compose:
   \`\`\`bash
   docker-compose up -d
   \`\`\`

### Manual Deployment

1. Build the application:
   \`\`\`bash
   npm run build
   \`\`\`

2. Set production environment variables
3. Run database migrations:
   \`\`\`bash
   npm run db:migrate
   \`\`\`

4. Start the server:
   \`\`\`bash
   npm start
   \`\`\`

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
