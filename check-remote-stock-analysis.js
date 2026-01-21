/**
 * Check a specific stock analysis on remote server via API
 * Usage: node check-remote-stock-analysis.js [stockAnalysisId] [AUTH_TOKEN or SESSION_COOKIE]
 */

const http = require('http');

const STOCK_ANALYSIS_ID = process.argv[2] || '24';
const BACKEND_URL = process.env.BACKEND_URL || 'http://72.60.233.159:3050';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const SESSION_COOKIE = process.env.SESSION_COOKIE || '';

async function checkRemoteStockAnalysis() {
  console.log('='.repeat(80));
  console.log('Checking Stock Analysis on Remote Server');
  console.log('='.repeat(80));
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`Stock Analysis ID: ${STOCK_ANALYSIS_ID}`);
  console.log('');

  const url = `${BACKEND_URL}/api/stock-analyses/${STOCK_ANALYSIS_ID}`;
  console.log(`Request URL: ${url}`);
  console.log('');

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
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
          console.log(JSON.stringify(jsonData, null, 2));
          console.log('');

          if (res.statusCode === 401) {
            console.log('❌ Authentication failed (401 Unauthorized)');
            console.log('   Get auth token from browser and set AUTH_TOKEN or SESSION_COOKIE');
          } else if (res.statusCode === 404) {
            console.log(`❌ Stock analysis not found (404)`);
            console.log(`   ID ${STOCK_ANALYSIS_ID} does not exist on remote server`);
            console.log('');
            console.log('To find available IDs, run:');
            console.log('   node check-remote-stock-analyses.js');
            console.log('   (with authentication)');
          } else if (res.statusCode === 200) {
            const analysis = jsonData.data?.stockAnalysis || jsonData.data || jsonData;
            console.log('✅ Stock analysis found:');
            console.log(`   ID: ${analysis.id}`);
            console.log(`   Symbol: ${analysis.symbol}`);
            console.log(`   Name: ${analysis.name || 'N/A'}`);
            console.log(`   Market: ${analysis.market || 'N/A'}`);
            console.log(`   Status: ${analysis.status}`);
            console.log('');
            console.log('Now you can test predictions:');
            console.log(`   node test-predictions-endpoint.js ${analysis.id} 10`);
          } else {
            console.log(`⚠️  Unexpected status code: ${res.statusCode}`);
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
      reject(error);
    });

    req.end();
  });
}

// Run the check
checkRemoteStockAnalysis()
  .then(() => {
    console.log('Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Check failed:', error);
    process.exit(1);
  });
