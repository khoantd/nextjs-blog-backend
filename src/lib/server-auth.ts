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
    
    console.log('✅ Loaded Google auth config from google_authen.json');
    return config;
  } catch (error) {
    console.error('❌ Error loading Google auth config from google_authen.json:', error);
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
