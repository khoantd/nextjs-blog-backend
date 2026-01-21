# Environment Variables Setup Guide

This guide explains how to configure environment variables for the backend API.

## Quick Start

1. Copy the example file:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` with your actual values

3. For production, set environment variables in your deployment platform

## Required Variables

### Essential (Must Have)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database connection string | `file:./dev.db` (local) or `file:/app/data/prod.db` (Docker) |
| `NEXTAUTH_SECRET` | Secret key for NextAuth.js JWT tokens | Generate with: `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | From Google Cloud Console |

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./dev.db` | SQLite database file path (use `file:/app/data/prod.db` in Docker) |
| `PORT` | `3001` | Backend server port |
| `NODE_ENV` | `development` | Environment mode (`development` or `production`) |
| `CORS_ORIGIN` | `http://localhost:3000` | Frontend URL(s) for CORS (comma-separated, include both HTTP and HTTPS if needed) |

**Important:** If your frontend is accessed via HTTPS, include both HTTP and HTTPS versions in `CORS_ORIGIN`:
```bash
CORS_ORIGIN=http://yourdomain.com,https://yourdomain.com,http://localhost:3000
```

The CORS configuration automatically handles protocol mismatches (HTTP ↔ HTTPS) by matching hostname and port.

### Authentication

#### NextAuth Configuration
- **NEXTAUTH_SECRET**: Required for JWT token signing
  ```bash
  # Generate a secure secret:
  openssl rand -base64 32
  ```

- **NEXTAUTH_URL**: Frontend URL (e.g., `http://localhost:3000`)

#### Google OAuth
You can configure Google OAuth in two ways:

**Option 1: Environment Variables (Recommended for Production)**
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

**Option 2: JSON File (For Local Development)**
Place `google_authen.json` in the project root:
```json
{
  "web": {
    "client_id": "your-client-id.apps.googleusercontent.com",
    "client_secret": "your-client-secret",
    "project_id": "your-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "redirect_uris": ["http://localhost:3000/api/auth/callback/google"]
  }
}
```

#### Admin Access Control
```bash
# Admin emails (comma-separated)
ADMIN_EMAILS=admin@example.com,admin2@example.com

# Admin domains (comma-separated)
ADMIN_DOMAINS=yourdomain.com
```

### AI Services

#### LiteLLM (Primary AI Service)
```bash
LITELLM_API_KEY=sk-your-api-key
LITELLM_BASE_URL=http://localhost:4010
```

#### OpenAI (Fallback)
```bash
OPENAI_API_KEY=sk-your-openai-api-key
```

#### Alpha Vantage (Earnings Data)
Get free API key at: https://www.alphavantage.co/support/#api-key
```bash
ALPHA_VANTAGE_API_KEY=your-api-key
```

### Vnstock API (Vietnamese Stocks)

#### Basic Configuration
```bash
VNSTOCK_API_URL=http://localhost:8002
```

#### Authentication (Choose One Method)

**Method 1: JWT Token**
```bash
VNSTOCK_API_TOKEN=your-jwt-token-here
```

**Method 2: Username/Password**
```bash
VNSTOCK_API_USERNAME=your-username
VNSTOCK_API_PASSWORD=your-password
```

#### Timeout Configuration (Optional)

**Default Timeout** (for regular API requests):
```bash
VNSTOCK_API_TIMEOUT=30000  # 30 seconds (default)
```

**CSV Download Timeout** (for CSV downloads, which can take longer):
```bash
VNSTOCK_API_CSV_TIMEOUT=180000  # 180 seconds / 3 minutes (default)
```

**Note:** CSV downloads may take longer, especially for large date ranges. If you encounter timeout errors, increase `VNSTOCK_API_CSV_TIMEOUT` (e.g., `300000` for 5 minutes).

## Environment-Specific Setup

### Local Development

1. Create `.env.local` file:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in required values:
   - `NEXTAUTH_SECRET` (generate with openssl)
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   - Other optional services as needed

3. Start the server:
   ```bash
   npm run dev
   ```

### Docker/Production

Set environment variables in your deployment platform:

**Docker Compose Example:**
```yaml
environment:
  - NODE_ENV=production
  - DATABASE_URL=file:/app/data/prod.db
  - PORT=3001
  - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
  - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
  - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
  - CORS_ORIGIN=https://yourdomain.com
volumes:
  - backend-data:/app/data
```

**Dockerfile:**
Environment variables should be set at runtime, not baked into the image.

**Kubernetes:**
Use ConfigMaps and Secrets:
```yaml
env:
  - name: NEXTAUTH_SECRET
    valueFrom:
      secretKeyRef:
        name: backend-secrets
        key: nextauth-secret
```

## Security Best Practices

1. **Never commit secrets**: Add `.env.local` and `.env` to `.gitignore`
2. **Use strong secrets**: Generate with `openssl rand -base64 32`
3. **Rotate secrets regularly**: Especially in production
4. **Use different secrets**: Dev, staging, and production should have different secrets
5. **Limit access**: Only grant access to environment variables to authorized personnel
6. **Use secrets management**: Consider using AWS Secrets Manager, HashiCorp Vault, etc.

## Generating Secrets

### NextAuth Secret
```bash
openssl rand -base64 32
```

### Random String (General Purpose)
```bash
# Linux/Mac
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Verification

After setting up environment variables, verify they're loaded:

```bash
# Check if variables are loaded (in development)
npm run dev
# Look for console logs showing which config sources are used
```

## Troubleshooting

### Variables Not Loading

1. **Check file name**: Must be `.env.local` (not `.env`)
2. **Check location**: File must be in project root
3. **Restart server**: Environment variables are loaded at startup
4. **Check syntax**: No spaces around `=` sign

### Missing Required Variables

The server will log warnings for missing required variables:
- `NEXTAUTH_SECRET`: Authentication will fail
- `GOOGLE_CLIENT_ID/SECRET`: OAuth login will fail

### Production Issues

1. **Verify NODE_ENV**: Should be `production`
2. **Check CORS_ORIGIN**: Must match your frontend URL
3. **Verify secrets**: Ensure they're set correctly in deployment platform
4. **Check logs**: Look for environment variable warnings

## Variable Reference

See `.env.example` for a complete list of all available environment variables with descriptions.
