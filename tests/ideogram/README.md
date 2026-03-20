# Ideogram Integration Test Suite

This directory contains comprehensive tests for the Ideogram AI image generation integration.

## 🧪 Test Files Overview

### Core Integration Tests

#### `diagnostic-ideogram.js`
**Purpose**: System health check and configuration validation
- ✅ Verifies Ideogram provider exists in database
- ✅ Lists all Ideogram models and their configuration
- ✅ Checks pricing data in models_price_score table
- ✅ Tests API key configuration
- ✅ Validates database relationships

**Usage**: `node tests/ideogram/diagnostic-ideogram.js`

#### `test-ideogram-generation.js`
**Purpose**: End-to-end image generation testing
- ✅ Tests actual image generation with real API calls
- ✅ Validates cost calculation and wallet deduction
- ✅ Checks file upload to Google Cloud Storage
- ✅ Verifies database record creation
- ✅ Tests complete message and attachment flow

**Usage**: `node tests/ideogram/test-ideogram-generation.js`

#### `test-ideogram-api.js`
**Purpose**: HTTP API endpoint testing
- ✅ Tests `/api/v1/chats/{chatId}/messages` endpoint
- ✅ Validates request/response format
- ✅ Tests authentication and authorization
- ✅ Checks streaming and non-streaming responses

**Usage**: `node tests/ideogram/test-ideogram-api.js`

### Service Layer Tests

#### `test-ideogram-sendrequest.js`
**Purpose**: Service method testing
- ✅ Tests `ideogramService.sendRequest()` method
- ✅ Validates parameter handling and response format
- ✅ Tests error scenarios and edge cases
- ✅ Checks integration with messages API

**Usage**: `node tests/ideogram/test-ideogram-sendrequest.js`

#### `test-ideogram-capabilities.js`
**Purpose**: Model capabilities validation
- ✅ Tests available models and their features
- ✅ Validates style and aspect ratio support
- ✅ Checks model compatibility with API parameters

**Usage**: `node tests/ideogram/test-ideogram-capabilities.js`

#### `test-ideogram-pricing.js`
**Purpose**: Cost calculation validation
- ✅ Tests pricing calculation for different operations
- ✅ Validates cost estimation accuracy
- ✅ Checks token conversion rates
- ✅ Tests markup and fee calculation

**Usage**: `node tests/ideogram/test-ideogram-pricing.js`

### Bug Fix Validation Tests

#### `test-model-resolution.js`
**Purpose**: Model lookup fix validation
- ✅ Tests model resolution by `model_slug` and `api_model_id`
- ✅ Validates "Model ideogram-v2 not found" fix
- ✅ Tests fallback and error handling

**Usage**: `node tests/ideogram/test-model-resolution.js`

#### `test-token-conversion.js`
**Purpose**: Token conversion fix validation
- ✅ Tests EUR to token conversion rate (1 EUR = 1000 tokens)
- ✅ Validates cost calculation accuracy
- ✅ Checks wallet balance verification

**Usage**: `node tests/ideogram/test-token-conversion.js`

#### `test-messagecost-fix.js`
**Purpose**: Database validation fix verification
- ✅ Tests MessageCost record creation
- ✅ Validates non-null field requirements
- ✅ Checks cost tracking for image models

**Usage**: `node tests/ideogram/test-messagecost-fix.js`

#### `test-postprocessing-fix.js`
**Purpose**: Post-processing error fix validation
- ✅ Tests negative token handling
- ✅ Validates cost calculator skip for Ideogram
- ✅ Checks clean error-free processing

**Usage**: `node tests/ideogram/test-postprocessing-fix.js`

#### `test-image-display-integration.js`
**Purpose**: Image display integration validation
- ✅ Tests Google Cloud Storage integration
- ✅ Validates signed URL generation
- ✅ Checks frontend image access workflow
- ✅ Documents complete display flow

**Usage**: `node tests/ideogram/test-image-display-integration.js`

## 🚀 Running Tests

### Prerequisites
1. **Database**: Ensure PostgreSQL is running and migrations are applied
2. **Environment**: Set up `.env` file with required configuration
3. **API Keys**: Configure `IDEOGRAM_API_KEY` in environment
4. **Google Cloud**: Ensure GCS credentials are properly configured

### Run All Tests
```bash
# From project root
cd tests/ideogram
for test in *.js; do echo "=== Running $test ==="; node "$test"; done
```

### Run Individual Tests
```bash
# Test specific functionality
node tests/ideogram/diagnostic-ideogram.js
node tests/ideogram/test-ideogram-generation.js
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=ideogram:* node tests/ideogram/diagnostic-ideogram.js
```

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check PostgreSQL is running
   - Verify database credentials in `.env`
   - Run database migrations

2. **API Key Error**
   - Verify `IDEOGRAM_API_KEY` is set
   - Check API key is valid and has credits
   - Test with Ideogram API directly

3. **Google Cloud Storage Error**
   - Verify GCS credentials are configured
   - Check bucket permissions
   - Ensure service account has proper roles

4. **Model Not Found Error**
   - Run `diagnostic-ideogram.js` first
   - Check models are imported in database
   - Verify provider configuration

### Getting Help

1. **Check Logs**: Review application logs for detailed error messages
2. **Run Diagnostics**: Start with `diagnostic-ideogram.js` for system overview
3. **Validate Configuration**: Ensure all environment variables are set
4. **Test Incrementally**: Run tests in order from basic to complex

## 📝 Test Development

### Adding New Tests
1. Create test file in this directory
2. Follow naming convention: `test-[feature]-[aspect].js`
3. Include proper documentation header
4. Use consistent error handling and logging
5. Update this README with test description

### Test Template
```javascript
#!/usr/bin/env node

/**
 * Test [Feature] [Aspect]
 * 
 * Brief description of what this test validates
 */

const db = require('../../database');

async function testFeature() {
  console.log('🧪 Testing [feature]...\n');
  
  try {
    // Test implementation
    
    console.log('✅ Test passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    if (db.close) await db.close();
  }
}

if (require.main === module) {
  testFeature();
}

module.exports = { testFeature };
```

---

**Last Updated**: August 3, 2025  
**Integration Status**: ✅ Complete - All core functionality tested and validated