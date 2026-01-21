/**
 * Test script for predictions endpoint
 * Usage: node test-predictions-endpoint.js [stockAnalysisId] [days]
 */

const http = require('http');

const STOCK_ANALYSIS_ID = process.argv[2] || '24';
const DAYS = process.argv[3] || '10';
const BACKEND_URL = process.env.BACKEND_URL || 'http://72.60.233.159:3050';

// You can set these environment variables or modify them here
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Bearer token if available
const SESSION_COOKIE = process.env.SESSION_COOKIE || ''; // NextAuth session cookie if available

async function testPredictionsEndpoint() {
  console.log('='.repeat(80));
  console.log('Testing Predictions Endpoint');
  console.log('='.repeat(80));
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`Stock Analysis ID: ${STOCK_ANALYSIS_ID}`);
  console.log(`Days: ${DAYS}`);
  console.log('');

  const url = `${BACKEND_URL}/api/stock-analyses/${STOCK_ANALYSIS_ID}/predictions?orderBy=date&order=desc&days=${DAYS}`;
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
      console.log('⚠️  WARNING: No authentication provided - request will likely fail with 401');
      console.log('   Set AUTH_TOKEN or SESSION_COOKIE environment variable');
    }
    console.log('');

    const req = http.request(options, (res) => {
      console.log(`Status Code: ${res.statusCode}`);
      console.log(`Status Message: ${res.statusMessage}`);
      console.log('Response Headers:');
      Object.entries(res.headers).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
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
          
          // Analyze the response
          console.log('');
          console.log('='.repeat(80));
          console.log('Response Analysis:');
          console.log('='.repeat(80));
          
          if (res.statusCode === 401) {
            console.log('❌ Authentication failed (401 Unauthorized)');
            console.log('');
            console.log('To fix this:');
            console.log('1. Get a valid auth token from your frontend session');
            console.log('2. Set AUTH_TOKEN environment variable:');
            console.log('   export AUTH_TOKEN="your-bearer-token"');
            console.log('3. Or set SESSION_COOKIE environment variable:');
            console.log('   export SESSION_COOKIE="next-auth.session-token=your-session-token"');
          } else if (res.statusCode === 404) {
            console.log('❌ Stock analysis not found (404)');
            console.log(`   Stock Analysis ID ${STOCK_ANALYSIS_ID} does not exist`);
          } else if (res.statusCode === 200) {
            if (jsonData.data && jsonData.data.predictions) {
              const predictions = jsonData.data.predictions;
              console.log(`✅ Success! Found ${predictions.length} predictions`);
              
              if (predictions.length === 0) {
                console.log('');
                console.log('⚠️  No predictions returned');
                if (jsonData.data.message) {
                  console.log(`   Message: ${jsonData.data.message}`);
                }
                console.log('');
                console.log('Possible reasons:');
                console.log('1. No factor data available - run factor analysis first');
                console.log('2. Factor data exists but filters removed all predictions');
                console.log('3. Check backend logs for [Predictions] entries');
              } else {
                console.log('');
                console.log('Sample predictions:');
                predictions.slice(0, 3).forEach((pred, idx) => {
                  console.log(`  ${idx + 1}. Date: ${pred.date}, Score: ${pred.score}, Prediction: ${pred.prediction}`);
                });
              }
            } else {
              console.log('⚠️  Unexpected response format');
              console.log('   Expected: { data: { predictions: [...] } }');
            }
          } else {
            console.log(`⚠️  Unexpected status code: ${res.statusCode}`);
            if (jsonData.error) {
              console.log(`   Error: ${jsonData.error}`);
            }
            if (jsonData.message) {
              console.log(`   Message: ${jsonData.message}`);
            }
          }
        } catch (e) {
          console.log('Raw response (not JSON):');
          console.log(data);
          console.log('');
          console.log('Error parsing JSON:', e.message);
        }
        
        console.log('');
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

// Run the test
testPredictionsEndpoint()
  .then(() => {
    console.log('Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
