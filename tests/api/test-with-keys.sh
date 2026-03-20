#!/bin/bash

# Test Video APIs with Real Keys
# Set your API keys here and run this script

echo "🔐 Setting up environment variables for API testing..."
echo "⚠️  Please edit this file and add your real API keys"

# TODO: Replace these with your actual API keys
export GOOGLE_GEMINI_KEY="your-google-gemini-key-here"
export AWS_ACCESS_KEY_ID="your-aws-access-key-here"
export AWS_SECRET_ACCESS_KEY="your-aws-secret-key-here" 
export AWS_REGION="us-east-1"
export RUNWAY_API_KEY="your-runway-api-key-here"

echo "🚀 Running real API test..."
node tests/api/real-api-test.js