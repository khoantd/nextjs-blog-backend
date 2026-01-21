/**
 * Check stock analyses on remote server via API
 * Usage: node check-remote-stock-analyses.js [AUTH_TOKEN or SESSION_COOKIE]
 */

const http = require('http');

const BACKEND_URL = process.env.BACKEND_URL || 'http://72.60.233.159:3050';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const SESSION_COOKIE = process.env.SESSION_COOKIE || '';

async function checkRemoteStockAnalyses() {
  console.log('='.repeat(80));
  console.log('Checking Stock Analyses on Remote Server');
  console.log('='.repeat(80));
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log('');

  const url = `${BACKEND_URL}/api/stock-analyses?limit=100`;
  console.log(`Request URL: ${url}`);
  console.log('');

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    };

    // Add authentication headers if available
    if (AUTH_TOKEN) {
      options.headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
      console.log('Using Bearer token authentication');
    } else if (SESSION_COOKIE) {
      options.headers['Cookie'] = SESSION_COOKIE;
      console.log('Using Cookie authentication');
    } else {
      console.log('⚠️  WARNING: No authentication provided');
      console.log('   Set AUTH_TOKEN or SESSION_COOKIE environment variable');
      console.log('   Example: export AUTH_TOKEN="your-token"');
    }
    console.log('');

    const req = http.request(options, (res) => {
      console.log(`Status Code: ${res.statusCode}`);
      console.log(`Status Message: ${res.statusMessage}`);
      console.log('');

      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('Response Body:');
        console.log('-'.repeat(80));
        
        try {
          const jsonData = JSON.parse(data);
          
          if (res.statusCode === 401) {
            console.log(JSON.stringify(jsonData, null, 2));
            console.log('');
            console.log('❌ Authentication failed (401 Unauthorized)');
            console.log('');
            console.log('To fix this:');
            console.log('1. Get a valid auth token from your frontend session');
            console.log('2. Set AUTH_TOKEN environment variable:');
            console.log('   export AUTH_TOKEN="your-bearer-token"');
            console.log('3. Or set SESSION_COOKIE environment variable:');
            console.log('   export SESSION_COOKIE="next-auth.session-token=your-session-token"');
            console.log('');
            console.log('See test-predictions-README.md for detailed instructions');
            resolve();
            return;
          }

          if (res.statusCode !== 200) {
            console.log(JSON.stringify(jsonData, null, 2));
            console.log('');
            console.log(`⚠️  Unexpected status code: ${res.statusCode}`);
            resolve();
            return;
          }

          // Parse response
          const analyses = jsonData.data?.items || jsonData.data || jsonData.items || [];
          const pagination = jsonData.data?.pagination || jsonData.pagination;

          console.log(`Found ${analyses.length} stock analyses:`);
          console.log('');

          if (analyses.length === 0) {
            console.log('No stock analyses found on remote server.');
            console.log('');
            console.log('This could mean:');
            console.log('1. No stock analyses have been created yet');
            console.log('2. Filters are excluding all results');
            console.log('3. Authentication issue (check if you have access)');
          } else {
            analyses.forEach((analysis, idx) => {
              console.log(`${idx + 1}. ID: ${analysis.id}`);
              console.log(`   Symbol: ${analysis.symbol}`);
              console.log(`   Name: ${analysis.name || 'N/A'}`);
              console.log(`   Market: ${analysis.market || 'N/A'}`);
              console.log(`   Status: ${analysis.status}`);
              if (analysis.createdAt) {
                console.log(`   Created: ${analysis.createdAt}`);
              }
              console.log('');
            });

            if (pagination) {
              console.log('Pagination:');
              console.log(`   Total: ${pagination.total || 'N/A'}`);
              console.log(`   Page: ${pagination.page || 'N/A'}`);
              console.log(`   Limit: ${pagination.limit || 'N/A'}`);
              console.log(`   Total Pages: ${pagination.totalPages || 'N/A'}`);
              console.log('');
            }

            console.log('='.repeat(80));
            console.log('To test predictions endpoint, use one of the IDs above:');
            if (analyses.length > 0) {
              console.log(`Example: node test-predictions-endpoint.js ${analyses[0].id} 10`);
            }
            console.log('='.repeat(80));
          }
        } catch (e) {
          console.log('Raw response (not JSON):');
          console.log(data);
          console.log('');
          console.log('Error parsing JSON:', e.message);
        }
        
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('Request Error:');
      console.error(error);
      console.log('');
      console.log('Possible issues:');
      console.log('1. Backend server is not running');
      console.log(`2. Cannot connect to ${BACKEND_URL}`);
      console.log('3. Network connectivity issues');
      reject(error);
    });

    req.end();
  });
}

// Run the check
checkRemoteStockAnalyses()
  .then(() => {
    console.log('Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Check failed:', error);
    process.exit(1);
  });
