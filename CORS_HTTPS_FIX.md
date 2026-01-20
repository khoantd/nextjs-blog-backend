# CORS and HTTPS Upgrade Issue - Fix Guide

## Problem Description

When accessing the frontend via HTTPS, browsers with HTTPS-Only Mode enabled will automatically upgrade all HTTP requests to HTTPS. This causes issues when:

1. Frontend is accessed via HTTPS (e.g., `https://yourdomain.com`)
2. Frontend makes requests to backend at `http://72.60.233.159:3050`
3. Browser upgrades the request to `https://72.60.233.159:3050`
4. Backend only serves HTTP, not HTTPS
5. Connection fails with CORS errors

## Error Symptoms

```
HTTPS-Only Mode: Upgrading insecure request "http://72.60.233.159:3050/api/..." to use "https"
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at https://72.60.233.159:3050/...
NetworkError when attempting to fetch resource
```

## Solutions

### Solution 1: Configure Backend CORS_ORIGIN (Immediate Fix)

Set the `CORS_ORIGIN` environment variable to include your frontend URL (both HTTP and HTTPS versions):

```bash
# In backend .env.local or deployment environment
CORS_ORIGIN=http://yourdomain.com,https://yourdomain.com,http://localhost:3000
```

The updated CORS configuration will now:
- Allow requests from origins matching by hostname and port (ignoring protocol)
- Handle protocol swaps (HTTP ↔ HTTPS)
- Provide better error messages

### Solution 2: Use Reverse Proxy (Recommended for Production)

Set up an nginx reverse proxy to handle HTTPS and proxy to HTTP backend:

**nginx.conf:**
```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then update frontend to use `https://api.yourdomain.com` instead of `http://72.60.233.159:3050`.

### Solution 3: Configure Backend to Serve HTTPS (Advanced)

Configure the backend Express server to serve HTTPS directly:

1. Obtain SSL certificate (Let's Encrypt, Cloudflare, etc.)
2. Update backend to use HTTPS
3. Update frontend `NEXT_PUBLIC_API_URL` to use HTTPS

**Note:** This requires SSL certificate management and is more complex.

### Solution 4: Disable HTTPS-Only Mode (Development Only)

For local development, you can disable HTTPS-Only Mode in your browser:

- **Firefox**: Settings → Privacy & Security → HTTPS-Only Mode → Off
- **Chrome**: Not recommended - use Solution 1 or 2 instead

**Warning:** Only use this for local development, never in production.

## Implementation Status

✅ **Completed:**
- Updated CORS configuration to handle protocol mismatches
- Added hostname/port matching (ignoring protocol)
- Added development mode fallback for localhost
- Improved error messages and logging

## Testing

After applying the fix:

1. Set `CORS_ORIGIN` environment variable in backend:
   ```bash
   CORS_ORIGIN=http://your-frontend-url,https://your-frontend-url
   ```

2. Restart the backend server

3. Test API requests from frontend - CORS errors should be resolved

4. Check backend logs for CORS messages:
   ```
   CORS: Allowing origin https://... (matches hostname and port, protocol may differ)
   ```

## Environment Variables

### Backend (.env.local or deployment)

```bash
# Required: Set to your frontend URL(s)
CORS_ORIGIN=http://localhost:3000,https://yourdomain.com

# Optional: For production
NODE_ENV=production
```

### Frontend (.env.local)

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=http://72.60.233.159:3050

# Or if using reverse proxy:
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## Additional Notes

- The CORS fix handles protocol mismatches, but the backend still needs to be accessible
- If backend doesn't support HTTPS, use a reverse proxy (Solution 2)
- For production, always use HTTPS for both frontend and backend
- The updated CORS configuration is backward compatible with existing setups

## Troubleshooting

### Still Getting CORS Errors?

1. **Check CORS_ORIGIN**: Ensure it includes your frontend URL
2. **Check Backend Logs**: Look for CORS warning messages
3. **Verify Frontend URL**: Make sure `NEXT_PUBLIC_API_URL` is correct
4. **Check Protocol**: Ensure backend URL protocol matches what browser expects

### Connection Still Failing?

1. **Backend Not Running**: Verify backend is running on port 3050
2. **Firewall Issues**: Check if port 3050 is accessible
3. **Network Issues**: Test backend health endpoint: `http://72.60.233.159:3050/health`
4. **HTTPS Certificate**: If using HTTPS, verify certificate is valid

## Related Files

- `/src/index.ts` - CORS configuration
- `/ENV_SETUP.md` - Environment variables guide
- `/docker-compose.yml` - Docker configuration example
