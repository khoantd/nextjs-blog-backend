#!/bin/bash

echo "=== Testing Latest Filter for Stock Analyses ==="
echo ""

# Check if server is running
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo "❌ Server is not running on port 3001"
  echo "Please start the server with: npm run dev"
  exit 1
fi

echo "✅ Server is running"
echo ""

echo "Test 1: Get latest analysis for symbol 'AAPL'"
curl -s "http://localhost:3001/api/stock-analyses?symbol=AAPL&latest=true" | head -100
echo ""
echo "---"
echo ""

echo "Test 2: Try to use latest without symbol (should fail with 400)"
curl -s "http://localhost:3001/api/stock-analyses?latest=true" | head -50
echo ""
echo "---"
echo ""

echo "Test 3: Get latest analysis for symbol 'TSLA'"
curl -s "http://localhost:3001/api/stock-analyses?symbol=TSLA&latest=true" | head -100
echo ""
echo "---"
echo ""

echo "Test 4: Get latest analysis with additional filters (market=US)"
curl -s "http://localhost:3001/api/stock-analyses?symbol=AAPL&latest=true&market=US" | head -100
echo ""
echo "---"
echo ""

echo "✅ Latest filter tests completed"
echo "Note: Authentication may be required for actual data retrieval"
