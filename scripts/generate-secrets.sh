#!/bin/bash

# Script to generate secure secrets for backend environment variables

echo "=========================================="
echo "Backend Secret Generator"
echo "=========================================="
echo ""

# Generate NextAuth Secret
echo "NEXTAUTH_SECRET:"
openssl rand -base64 32
echo ""

# Generate random API key (for LiteLLM, etc.)
echo "API_KEY (for LiteLLM or other services):"
openssl rand -hex 32
echo ""

# Generate random token (for Vnstock API, etc.)
echo "JWT_TOKEN (for Vnstock API, etc.):"
openssl rand -base64 48
echo ""

echo "=========================================="
echo "Copy these values to your .env.local file"
echo "=========================================="
