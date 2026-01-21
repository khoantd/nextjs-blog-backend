/**
 * Enhanced test script for predictions endpoint - verifies descending date order
 * Usage: node test-predictions-descending.js [stockAnalysisId] [days]
 */

const http = require('http');

const STOCK_ANALYSIS_ID = process.argv[2] || '24';
const DAYS = process.argv[3] || '10';
const BACKEND_URL = process.env.BACKEND_URL || 'http://72.60.233.159:3050';

// You can set these environment variables or modify them here
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const SESSION_COOKIE = process.env.SESSION_COOKIE || '';

function parseDate(dateStr) {
  // Handle various date formats: YYYY-MM-DD, MM/DD/YYYY, etc.
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length >= 3) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
    }
  }
  return new Date(dateStr);
}

function compareDates(date1, date2) {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  return d1.getTime() - d2.getTime();
}

async function testPredictionsEndpoint() {
  console.log('='.repeat(80));
  console.log('Testing Predictions Endpoint - Descending Date Order Verification');
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
            resolve();
            return;
          } else if (res.statusCode === 404) {
            console.log('❌ Stock analysis not found (404)');
            console.log(`   Stock Analysis ID ${STOCK_ANALYSIS_ID} does not exist`);
            resolve();
            return;
          } else if (res.statusCode === 200) {
            if (jsonData.data && jsonData.data.predictions) {
              const predictions = jsonData.data.predictions;
              console.log(`✅ Success! Found ${predictions.length} predictions`);
              console.log('');
              
              if (predictions.length === 0) {
                console.log('⚠️  No predictions returned');
                if (jsonData.data.message) {
                  console.log(`   Message: ${jsonData.data.message}`);
                }
                console.log('');
                console.log('Possible reasons:');
                console.log('1. No factor data available - run factor analysis first');
                console.log('2. Factor data exists but filters removed all predictions');
                console.log('3. Check backend logs for [Predictions] entries');
                resolve();
                return;
              }

              // Verify descending date order
              console.log('📅 Date Order Verification:');
              console.log('-'.repeat(80));
              
              let isDescending = true;
              let previousDate = null;
              const dateIssues = [];

              for (let i = 0; i < predictions.length; i++) {
                const pred = predictions[i];
                const currentDate = pred.date;
                
                if (previousDate !== null) {
                  const comparison = compareDates(previousDate, currentDate);
                  if (comparison < 0) {
                    // Previous date is earlier than current date - this is WRONG (should be descending)
                    isDescending = false;
                    dateIssues.push({
                      index: i,
                      previous: previousDate,
                      current: currentDate,
                      issue: 'Previous date is earlier than current (should be descending)'
                    });
                  } else if (comparison === 0) {
                    dateIssues.push({
                      index: i,
                      previous: previousDate,
                      current: currentDate,
                      issue: 'Duplicate dates found'
                    });
                  }
                }
                
                previousDate = currentDate;
              }

              if (isDescending && dateIssues.length === 0) {
                console.log('✅ PASS: Dates are in descending order (most recent first)');
                console.log(`   First date (most recent): ${predictions[0].date}`);
                console.log(`   Last date (oldest): ${predictions[predictions.length - 1].date}`);
              } else {
                console.log('❌ FAIL: Dates are NOT in descending order');
                dateIssues.forEach(issue => {
                  console.log(`   Issue at index ${issue.index}: ${issue.issue}`);
                  console.log(`     Previous: ${issue.previous}, Current: ${issue.current}`);
                });
              }

              console.log('');
              console.log('📊 Predictions Details:');
              console.log('-'.repeat(80));
              predictions.forEach((pred, idx) => {
                console.log(`  ${idx + 1}. Date: ${pred.date}, Score: ${pred.score}, Prediction: ${pred.prediction}`);
                if (pred.activeFactors && pred.activeFactors.length > 0) {
                  console.log(`     Active Factors: ${pred.activeFactors.join(', ')}`);
                }
              });

              // Verify we got the requested number of days (or less if not enough data)
              console.log('');
              console.log('📈 Count Verification:');
              console.log('-'.repeat(80));
              if (predictions.length <= parseInt(DAYS, 10)) {
                console.log(`✅ PASS: Returned ${predictions.length} predictions (requested ${DAYS} days)`);
                if (predictions.length < parseInt(DAYS, 10)) {
                  console.log(`   Note: Less than requested, likely due to limited data availability`);
                }
              } else {
                console.log(`⚠️  WARNING: Returned ${predictions.length} predictions (requested ${DAYS} days)`);
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
