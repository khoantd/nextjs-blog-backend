/**
 * Detailed test of predictions endpoint with factor analysis
 */

const http = require('http');

const STOCK_ANALYSIS_ID = process.argv[2] || '24';
const DAYS = process.argv[3] || '10';
const BACKEND_URL = process.env.BACKEND_URL || 'http://72.60.233.159:3050';

// Get dev token
async function getDevToken() {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`${BACKEND_URL}/api/auth/dev-token`);
    const req = http.get({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.token);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

async function testDetailed() {
  console.log('='.repeat(80));
  console.log('Detailed Predictions Test');
  console.log('='.repeat(80));
  console.log(`Stock Analysis ID: ${STOCK_ANALYSIS_ID}`);
  console.log(`Days: ${DAYS}`);
  console.log('');

  // Get dev token
  console.log('1. Getting dev token...');
  let token;
  try {
    token = await getDevToken();
    console.log('✅ Dev token obtained');
  } catch (error) {
    console.error('❌ Failed to get dev token:', error.message);
    return;
  }
  console.log('');

  // Test predictions endpoint
  console.log('2. Testing predictions endpoint...');
  const url = `${BACKEND_URL}/api/stock-analyses/${STOCK_ANALYSIS_ID}/predictions?orderBy=date&order=desc&days=${DAYS}`;
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          console.log(`Status: ${res.statusCode}`);
          console.log('');
          
          if (json.data && json.data.predictions) {
            const predictions = json.data.predictions;
            console.log(`Found ${predictions.length} predictions:`);
            console.log('');
            
            // Analyze predictions
            const withFactors = predictions.filter(p => p.activeFactors && p.activeFactors.length > 0);
            const highProb = predictions.filter(p => p.prediction === 'HIGH_PROBABILITY');
            const moderate = predictions.filter(p => p.prediction === 'MODERATE');
            const lowProb = predictions.filter(p => p.prediction === 'LOW_PROBABILITY');
            
            console.log('Prediction Summary:');
            console.log(`  HIGH_PROBABILITY: ${highProb.length}`);
            console.log(`  MODERATE: ${moderate.length}`);
            console.log(`  LOW_PROBABILITY: ${lowProb.length}`);
            console.log(`  With Active Factors: ${withFactors.length}`);
            console.log('');
            
            if (predictions.length > 0) {
              console.log('Sample Predictions:');
              predictions.slice(0, 3).forEach((p, idx) => {
                console.log(`  ${idx + 1}. Date: ${p.date}`);
                console.log(`     Score: ${p.score}`);
                console.log(`     Prediction: ${p.prediction}`);
                console.log(`     Confidence: ${p.confidence}`);
                console.log(`     Active Factors: ${p.activeFactors.length}`);
                if (p.activeFactors.length > 0) {
                  p.activeFactors.forEach(f => {
                    console.log(`       - ${f.factor}: ${f.name} (weight: ${f.weight})`);
                  });
                }
                console.log('');
              });
            }
            
            // Check if all scores are 0
            const allZeroScores = predictions.every(p => p.score === 0);
            if (allZeroScores) {
              console.log('⚠️  WARNING: All predictions have score 0');
              console.log('   This suggests:');
              console.log('   1. No factors are active (all factors are false)');
              console.log('   2. Factor data exists but factors were not calculated');
              console.log('   3. Factor calculation may need to be regenerated');
              console.log('');
            }
            
            // Check date range
            if (predictions.length > 0) {
              const dates = predictions.map(p => p.date).sort();
              console.log('Date Range:');
              console.log(`  From: ${dates[0]}`);
              console.log(`  To: ${dates[dates.length - 1]}`);
              console.log('');
            }
          } else {
            console.log('No predictions found in response');
            console.log('Response:', JSON.stringify(json, null, 2));
          }
          
          resolve();
        } catch (e) {
          console.error('Error parsing response:', e);
          console.log('Raw response:', data);
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

testDetailed()
  .then(() => {
    console.log('Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
