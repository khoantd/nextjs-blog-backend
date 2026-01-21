#!/bin/bash

echo "=== Testing Stock Analyses Filtering Implementation ==="
echo ""

# Check if server is running
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo "❌ Server is not running on port 3001"
  echo "Please start the server with: npm run dev"
  exit 1
fi

echo "✅ Server is running"
echo ""

# Test filter parsing with invalid date
echo "Test 1: Invalid date filter (should return 400)"
curl -s "http://localhost:3001/api/stock-analyses?createdFrom=invalid-date" | head -50
echo ""
echo "---"
echo ""

# Test multiple filters
echo "Test 2: Multiple valid filters"
curl -s "http://localhost:3001/api/stock-analyses?market=US&limit=5" | head -50
echo ""
echo "---"
echo ""

echo "Test 3: Symbol filter"
curl -s "http://localhost:3001/api/stock-analyses?symbol=A&limit=3" | head -50
echo ""
echo "---"
echo ""

echo "✅ Filtering tests completed"
echo "Note: Authentication may be required for actual data retrieval"
