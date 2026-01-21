/**
 * Test scan-high-probability endpoint against remote server
 * Validates the endpoint with actual data
 */

const axios = require('axios');

const REMOTE_SERVER = 'http://72.60.233.159:3050';

async function testRemoteScan() {
  const authToken = process.env.AUTH_TOKEN || global.AUTH_TOKEN;
  const authHeaders = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== Testing Remote Scan Endpoint ===\n');
    console.log(`Server: ${REMOTE_SERVER}\n`);

    // Test 1: Scan with original parameters
    console.log('Test 1: Original parameters');
    console.log('GET /api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=2&minConfidence=30&format=text\n');
    
    try {
      const response1 = await axios.get(`${REMOTE_SERVER}/api/stock-analyses/scan-high-probability`, {
        params: {
          status: 'completed',
          futureDays: 7,
          minScore: 2,
          minConfidence: 30,
          format: 'text'
        },
        headers: authHeaders,
        timeout: 30000
      });
      
      console.log('Response (text):');
      console.log(response1.data);
      console.log('\n---\n');
    } catch (error) {
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
        console.log(`Error: ${error.response.data}`);
      } else {
        console.log(`Error: ${error.message}`);
      }
      console.log('\n---\n');
    }

    // Test 2: Scan with relaxed filters (minScore=0)
    console.log('Test 2: Relaxed filters (minScore=0)');
    console.log('GET /api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=0&format=text\n');
    
    try {
      const response2 = await axios.get(`${REMOTE_SERVER}/api/stock-analyses/scan-high-probability`, {
        params: {
          status: 'completed',
          futureDays: 7,
          minScore: 0,
          format: 'text'
        },
        headers: authHeaders,
        timeout: 30000
      });
      
      console.log('Response (text):');
      console.log(response2.data);
      console.log('\n---\n');
    } catch (error) {
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
        console.log(`Error: ${error.response.data}`);
      } else {
        console.log(`Error: ${error.message}`);
      }
      console.log('\n---\n');
    }

    // Test 3: Get JSON response for detailed analysis
    console.log('Test 3: JSON response (no format=text)');
    console.log('GET /api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=0\n');
    
    try {
      const response3 = await axios.get(`${REMOTE_SERVER}/api/stock-analyses/scan-high-probability`, {
        params: {
          status: 'completed',
          futureDays: 7,
          minScore: 0
        },
        headers: authHeaders,
        timeout: 30000
      });
      
      console.log('Response (JSON):');
      console.log(JSON.stringify(response3.data, null, 2));
      
      if (response3.data?.data) {
        console.log('\nSummary:');
        console.log(`- Total scanned: ${response3.data.data.summary?.totalScanned || 0}`);
        console.log(`- High probability count: ${response3.data.data.summary?.highProbabilityCount || 0}`);
        console.log(`- Warnings: ${response3.data.data.warnings?.length || 0}`);
        
        if (response3.data.data.warnings && response3.data.data.warnings.length > 0) {
          console.log('\nWarnings:');
          response3.data.data.warnings.slice(0, 5).forEach(w => {
            console.log(`  - ${w.symbol}: ${w.error}`);
          });
        }
      }
      console.log('\n---\n');
    } catch (error) {
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
        console.log(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
      } else {
        console.log(`Error: ${error.message}`);
      }
      console.log('\n---\n');
    }

    // Test 4: Check if we can get a single stock analysis to inspect factor data
    console.log('Test 4: Get list of completed analyses');
    console.log('GET /api/stock-analyses?status=completed\n');
    
    try {
      const response4 = await axios.get(`${REMOTE_SERVER}/api/stock-analyses`, {
        params: {
          status: 'completed'
        },
        headers: authHeaders,
        timeout: 30000
      });
      
      if (response4.data?.data?.stockAnalyses) {
        const analyses = response4.data.data.stockAnalyses;
        console.log(`Found ${analyses.length} completed analyses:`);
        analyses.slice(0, 5).forEach(a => {
          console.log(`  - ${a.symbol} (${a.market || 'N/A'}) - ID: ${a.id}, Status: ${a.status}`);
        });
        
        // Get details of first analysis to check factor data
        if (analyses.length > 0) {
          const firstAnalysis = analyses[0];
          console.log(`\nChecking factor data for ${firstAnalysis.symbol} (ID: ${firstAnalysis.id})...`);
          
          try {
            const detailResponse = await axios.get(`${REMOTE_SERVER}/api/stock-analyses/${firstAnalysis.id}`, {
              headers: authHeaders,
              timeout: 30000
            });
            
            if (detailResponse.data?.data?.stockAnalysis) {
              const analysis = detailResponse.data.data.stockAnalysis;
              const factorDataCount = analysis.dailyFactorData?.length || 0;
              console.log(`  - Daily factor data records: ${factorDataCount}`);
              
              if (factorDataCount > 0) {
                const recentData = analysis.dailyFactorData.slice(-10);
                const recordsWithFactors = recentData.filter(r => {
                  return r.volume_spike || r.break_ma50 || r.break_ma200 || r.rsi_over_60 ||
                         r.market_up || r.sector_up || r.short_covering || r.earnings_window ||
                         r.macro_tailwind || r.news_positive;
                });
                
                console.log(`  - Recent records with active factors: ${recordsWithFactors.length}/10`);
                
                if (recordsWithFactors.length === 0 && recentData.length > 0) {
                  const sample = recentData[recentData.length - 1];
                  console.log(`  - Sample record (${sample.date}):`);
                  console.log(`    Volume spike: ${sample.volume_spike}`);
                  console.log(`    Break MA50: ${sample.break_ma50}`);
                  console.log(`    Break MA200: ${sample.break_ma200}`);
                  console.log(`    RSI > 60: ${sample.rsi_over_60}`);
                  console.log(`    Close: ${sample.close}`);
                }
              }
            }
          } catch (detailError) {
            console.log(`  Error getting analysis details: ${detailError.message}`);
          }
        }
      }
      console.log('\n---\n');
    } catch (error) {
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
        console.log(`Error: ${error.response.data}`);
      } else {
        console.log(`Error: ${error.message}`);
      }
      console.log('\n---\n');
    }

    console.log('=== Test Complete ===');

  } catch (error) {
    console.error('Test error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Check if we need authentication
async function checkAuth() {
  try {
    const response = await axios.get(`${REMOTE_SERVER}/api/stock-analyses/scan-high-probability`, {
      params: { status: 'completed', format: 'text' },
      timeout: 5000
    });
    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('⚠️  Authentication required.');
      console.log('\nTo test the endpoint, you can:');
      console.log('1. Get a token from your browser after logging in');
      console.log('2. Update the AUTH_TOKEN variable in this script');
      console.log('3. Or use curl commands (see CURL_COMMANDS.md)\n');
      return false;
    }
    return true; // Other errors might be OK
  }
}

// Get auth token from environment or use placeholder
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'YOUR_AUTH_TOKEN_HERE';

async function main() {
  if (AUTH_TOKEN === 'YOUR_AUTH_TOKEN_HERE') {
    console.log('⚠️  No auth token provided.');
    console.log('Set AUTH_TOKEN environment variable or update the script.\n');
    console.log('Example: AUTH_TOKEN=your_token_here node test-remote-scan.js\n');
    
    // Still try to check auth requirement
    const needsAuth = await checkAuth();
    if (!needsAuth) {
      console.log('\nGenerating curl commands for manual testing...\n');
      generateCurlCommands();
    }
    return;
  }
  
  // Update axios calls to use the token
  global.AUTH_TOKEN = AUTH_TOKEN;
  await testRemoteScan();
}

function generateCurlCommands() {
  console.log('=== CURL Commands for Manual Testing ===\n');
  console.log('Replace YOUR_TOKEN with your actual NextAuth JWT token\n');
  console.log('# Test 1: Original parameters (text format)');
  console.log(`curl -X GET "${REMOTE_SERVER}/api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=2&minConfidence=30&format=text" \\`);
  console.log('  -H "Authorization: Bearer YOUR_TOKEN" \\');
  console.log('  -H "Content-Type: application/json"\n');
  
  console.log('# Test 2: Relaxed filters (minScore=0, text format)');
  console.log(`curl -X GET "${REMOTE_SERVER}/api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=0&format=text" \\`);
  console.log('  -H "Authorization: Bearer YOUR_TOKEN" \\');
  console.log('  -H "Content-Type: application/json"\n');
  
  console.log('# Test 3: JSON response (for detailed analysis)');
  console.log(`curl -X GET "${REMOTE_SERVER}/api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=0" \\`);
  console.log('  -H "Authorization: Bearer YOUR_TOKEN" \\');
  console.log('  -H "Content-Type: application/json" | jq\n');
}

main();
