/**
 * Validation script to diagnose why predictions have 0.000 scores
 * 
 * This script checks:
 * 1. Whether factor data has active factors
 * 2. Whether factor extraction is working correctly
 * 3. Whether baseline selection finds days with active factors
 */

const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL || 'http://72.60.233.159:3050';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('❌ AUTH_TOKEN environment variable is required');
  console.error('   Usage: AUTH_TOKEN=your_token node validate-prediction-scores.js');
  process.exit(1);
}

async function validatePredictionScores() {
  console.log('=== Validating Prediction Score Generation ===\n');
  console.log(`Server: ${SERVER_URL}\n`);

  try {
    // Step 1: Get list of completed analyses
    console.log('Step 1: Fetching completed stock analyses...');
    const analysesResponse = await axios.get(`${SERVER_URL}/api/stock-analyses?status=completed`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    // Handle paginated response structure: { data: { items: [...], total: N, ... } }
    let analyses = [];
    const responseData = analysesResponse.data?.data || analysesResponse.data;
    
    if (Array.isArray(responseData)) {
      analyses = responseData;
    } else if (responseData && typeof responseData === 'object') {
      // Paginated response with items array
      if (Array.isArray(responseData.items)) {
        analyses = responseData.items;
      } else if (Array.isArray(responseData.data)) {
        analyses = responseData.data;
      }
    }
    
    console.log(`   Found ${analyses.length} completed analyses\n`);

    if (analyses.length === 0) {
      console.log('⚠️  No completed analyses found. Cannot validate predictions.');
      console.log('   Response structure:', JSON.stringify(analysesResponse.data, null, 2));
      return;
    }

    // Step 2: Check factor data for first few analyses
    const analysesToCheck = analyses.slice(0, 3);
    
    for (const analysis of analysesToCheck) {
      const analysisId = analysis.id;
      const symbol = analysis.symbol || 'UNKNOWN';
      
      console.log(`\n--- Analyzing: ${symbol} (ID: ${analysisId}) ---`);
      
      // Get factor data via the predictions endpoint (this triggers factor calculation)
      try {
        console.log(`   Fetching factor data and generating predictions...`);
        const predictionsResponse = await axios.get(
          `${SERVER_URL}/api/stock-analyses/${analysisId}/predictions?daysLimit=5&futureDays=7`,
          {
            headers: {
              'Authorization': `Bearer ${AUTH_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const predictions = predictionsResponse.data?.data?.predictions || [];
        console.log(`   Generated ${predictions.length} predictions`);

        if (predictions.length === 0) {
          console.log(`   ⚠️  No predictions generated for ${symbol}`);
          continue;
        }

        // Analyze prediction scores
        const futurePredictions = predictions.filter(p => p.isFuture === true);
        const historicalPredictions = predictions.filter(p => !p.isFuture);

        console.log(`   Historical predictions: ${historicalPredictions.length}`);
        console.log(`   Future predictions: ${futurePredictions.length}`);

        // Check scores
        const zeroScorePredictions = predictions.filter(p => (p.score || 0) === 0);
        const nonZeroScorePredictions = predictions.filter(p => (p.score || 0) > 0);

        console.log(`   Predictions with score 0.000: ${zeroScorePredictions.length}`);
        console.log(`   Predictions with score > 0: ${nonZeroScorePredictions.length}`);

        // Check active factors
        const predictionsWithFactors = predictions.filter(p => 
          p.activeFactors && Array.isArray(p.activeFactors) && p.activeFactors.length > 0
        );
        const predictionsWithoutFactors = predictions.filter(p => 
          !p.activeFactors || !Array.isArray(p.activeFactors) || p.activeFactors.length === 0
        );

        console.log(`   Predictions with active factors: ${predictionsWithFactors.length}`);
        console.log(`   Predictions without active factors: ${predictionsWithoutFactors.length}`);

        // Show sample predictions
        if (futurePredictions.length > 0) {
          console.log(`\n   Sample Future Predictions (first 3):`);
          futurePredictions.slice(0, 3).forEach((pred, idx) => {
            console.log(`   ${idx + 1}. Date: ${pred.date}`);
            console.log(`      Score: ${pred.score || 0}`);
            console.log(`      Prediction: ${pred.prediction || 'UNKNOWN'}`);
            console.log(`      Confidence: ${pred.confidence ? (pred.confidence * 100).toFixed(1) + '%' : 'N/A'}`);
            console.log(`      Active Factors: ${pred.activeFactors?.length || 0}`);
            if (pred.activeFactors && pred.activeFactors.length > 0) {
              console.log(`      Factor Names: ${pred.activeFactors.map(f => f.factor).join(', ')}`);
            }
            console.log('');
          });
        }

        // Check historical predictions for factor patterns
        if (historicalPredictions.length > 0) {
          console.log(`\n   Sample Historical Predictions (last 3):`);
          historicalPredictions.slice(-3).forEach((pred, idx) => {
            console.log(`   ${idx + 1}. Date: ${pred.date}`);
            console.log(`      Score: ${pred.score || 0}`);
            console.log(`      Prediction: ${pred.prediction || 'UNKNOWN'}`);
            console.log(`      Active Factors: ${pred.activeFactors?.length || 0}`);
            if (pred.activeFactors && pred.activeFactors.length > 0) {
              console.log(`      Factor Names: ${pred.activeFactors.map(f => f.factor).join(', ')}`);
            }
            console.log('');
          });
        }

        // Diagnostic: Check if all scores are 0
        if (zeroScorePredictions.length === predictions.length) {
          console.log(`   ⚠️  WARNING: All predictions have score 0.000 for ${symbol}`);
          console.log(`   This indicates no active factors were found in the data.`);
          console.log(`   Possible causes:`);
          console.log(`   1. Factor analysis was not run or failed`);
          console.log(`   2. No days in the data meet factor criteria`);
          console.log(`   3. Factor extraction is not working correctly`);
        }

      } catch (error) {
        console.error(`   ❌ Error analyzing ${symbol}:`, error.response?.data || error.message);
      }
    }

    // Step 3: Test scan endpoint to see overall statistics
    console.log(`\n\n=== Testing Scan Endpoint ===`);
    try {
      const scanResponse = await axios.get(
        `${SERVER_URL}/api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=0&format=text`,
        {
          headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('\nScan Results:');
      console.log(scanResponse.data);
    } catch (error) {
      console.error('❌ Error testing scan endpoint:', error.response?.data || error.message);
    }

    console.log('\n=== Validation Complete ===');

  } catch (error) {
    console.error('❌ Validation failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

validatePredictionScores();
