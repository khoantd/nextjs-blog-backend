/**
 * Helper script to extract authentication token from browser
 * 
 * Instructions:
 * 1. Open your frontend app in browser (e.g., http://localhost:3000)
 * 2. Sign in
 * 3. Open browser console (F12)
 * 4. Copy and paste the code below into the console
 * 5. Copy the output token/cookie
 */

console.log('='.repeat(80));
console.log('Authentication Token Extractor');
console.log('='.repeat(80));
console.log('');

// Method 1: Get session cookie
const cookies = document.cookie.split('; ').reduce((acc, cookie) => {
  const [name, value] = cookie.split('=');
  acc[name] = value;
  return acc;
}, {});

const sessionToken = cookies['next-auth.session-token'] || cookies['__Secure-next-auth.session-token'];

if (sessionToken) {
  console.log('✅ Found session cookie:');
  console.log(`   next-auth.session-token=${sessionToken}`);
  console.log('');
  console.log('To use this in test script:');
  console.log(`export SESSION_COOKIE="next-auth.session-token=${sessionToken}"`);
  console.log('');
} else {
  console.log('❌ No session cookie found');
  console.log('Available cookies:', Object.keys(cookies));
  console.log('');
}

// Method 2: Try to get from localStorage
const localStorageToken = localStorage.getItem('next-auth.session-token') || 
                         localStorage.getItem('token') ||
                         localStorage.getItem('authToken');

if (localStorageToken) {
  console.log('✅ Found token in localStorage:');
  console.log(`   ${localStorageToken.substring(0, 50)}...`);
  console.log('');
  console.log('To use this in test script:');
  console.log(`export AUTH_TOKEN="${localStorageToken}"`);
  console.log('');
} else {
  console.log('❌ No token found in localStorage');
  console.log('');
}

// Method 3: Check for Bearer token in recent API requests
console.log('To get Bearer token from network requests:');
console.log('1. Open Network tab in DevTools');
console.log('2. Make a request to any backend API');
console.log('3. Check Request Headers for "Authorization: Bearer <token>"');
console.log('4. Copy the token value');
console.log('');

// Method 4: Check if we can extract from fetch interceptors
if (window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const request = args[0];
    const options = args[1] || {};
    const headers = options.headers || {};
    
    if (headers.Authorization) {
      const token = headers.Authorization.replace('Bearer ', '');
      console.log('✅ Found Bearer token in fetch request:');
      console.log(`   ${token.substring(0, 50)}...`);
      console.log('');
      console.log('To use this in test script:');
      console.log(`export AUTH_TOKEN="${token}"`);
      console.log('');
    }
    
    return originalFetch.apply(this, args);
  };
  
  console.log('📡 Fetch interceptor installed - make an API request to capture token');
  console.log('');
}

console.log('='.repeat(80));
console.log('Copy the export command above and run it in your terminal');
console.log('Then run: node test-predictions-endpoint.js 24 10');
console.log('='.repeat(80));
