import { readFileSync } from 'fs';
import { join } from 'path';

interface GoogleAuthConfig {
  web: {
    client_id: string;
    project_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_secret: string;
    redirect_uris: string[];
    javascript_origins: string[];
  };
}

// Server-side Google auth configuration loading
export function loadGoogleAuthConfig(): GoogleAuthConfig | null {
  try {
    const configPath = join(process.cwd(), 'google_authen.json');
    const configContent = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent) as GoogleAuthConfig;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Loaded Google auth config from google_authen.json');
    }
    return config;
  } catch (error: any) {
    // Silently fail if file doesn't exist (expected in Docker/production)
    // Only log if it's a different error (permissions, invalid JSON, etc.)
    if (error.code !== 'ENOENT' && process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Could not load Google auth config from google_authen.json:', error.message);
    }
    return null;
  }
}

export function getGoogleClientId(): string | null {
  // First try to load from JSON file
  const config = loadGoogleAuthConfig();
  if (config?.web?.client_id) {
    return config.web.client_id;
  }
  
  // Fallback to environment variable
  return process.env.GOOGLE_CLIENT_ID || null;
}

export function getGoogleClientSecret(): string | null {
  // First try to load from JSON file
  const config = loadGoogleAuthConfig();
  if (config?.web?.client_secret) {
    return config.web.client_secret;
  }
  
  // Fallback to environment variable
  return process.env.GOOGLE_CLIENT_SECRET || null;
}
