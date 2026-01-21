# Quick Guide: Testing with Browser Authentication

Since the endpoint requires authentication, here's the fastest way to test:

## Method 1: Copy Cookie from Browser Console

1. Open your frontend app in browser (e.g., `http://localhost:3000`)
2. Sign in
3. Open Browser Console (F12 → Console tab)
4. Paste this code and press Enter:

```javascript
// Get session cookie
const cookies = document.cookie.split('; ').reduce((acc, cookie) => {
  const [name, value] = cookie.split('=');
  acc[name] = value;
  return acc;
}, {});

const sessionToken = cookies['next-auth.session-token'] || cookies['__Secure-next-auth.session-token'];

if (sessionToken) {
  console.log('Copy this command:');
  console.log(`export SESSION_COOKIE="next-auth.session-token=${sessionToken}"`);
} else {
  console.log('No session cookie found. Make sure you are signed in.');
  console.log('Available cookies:', Object.keys(cookies));
}
```

5. Copy the `export` command from the console output
6. Run it in your terminal
7. Then test: `node test-predictions-endpoint.js 24 10`

## Method 2: Use Browser Network Tab

1. Open your frontend app and sign in
2. Open DevTools → Network tab
3. Make any API request (e.g., navigate to stock analyses page)
4. Click on a request to your backend API
5. Go to Headers → Request Headers
6. Find the `Cookie` header
7. Copy the entire cookie value
8. Run: `export SESSION_COOKIE="<paste-cookie-value>"`
9. Test: `node test-predictions-endpoint.js 24 10`

## Method 3: Test Directly from Browser

If you want to test without scripts, you can use the browser directly:

1. Open your frontend app and sign in
2. Open Browser Console (F12)
3. Paste this:

```javascript
fetch('http://72.60.233.159:3050/api/stock-analyses/24/predictions?orderBy=date&order=desc&days=10', {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => {
  console.log('Response:', JSON.stringify(data, null, 2));
  if (data.data && data.data.predictions) {
    console.log(`Found ${data.data.predictions.length} predictions`);
  }
})
.catch(err => console.error('Error:', err));
```

This will use your browser's cookies automatically.
