# Test Suite Organization

This directory contains all tests for the AiGens backend, organized by category for better maintainability and clarity.

## 📁 Directory Structure

### `/tests/services/`
**Service Layer Tests** - Tests for individual services and business logic
- `test-calculate-cost.js` - Cost calculation service testing
- `test-openrouter-api.js` - OpenRouter API integration testing  
- `test-together-api.js` - Together AI API integration testing

### `/tests/api/`
**API Endpoint Tests** - Tests for HTTP endpoints and API functionality
- `test-oauth-callback.js` - OAuth callback endpoint testing
- `test-user-request.js` - User request API testing

### `/tests/utils/`
**Utility Function Tests** - Tests for helper functions and utilities
- `test-capability-mapping.js` - Model capability mapping testing
- `test-pricing-implementation.js` - Pricing implementation testing
- `test-source-detection.js` - Source detection utility testing
- `test-sync-engine-direct.js` - Direct sync engine testing

### `/tests/setup/`
**Setup and Utility Scripts** - Database setup and test data creation
- `create-test-user.js` - Test user creation utility
- `recreate-test-user.js` - Test user recreation utility

### `/tests/ideogram/`
**Ideogram Integration Tests** - Complete test suite for Ideogram AI integration
- See `/tests/ideogram/README.md` for detailed documentation

### `/tests/integration/`
**Integration Tests** - End-to-end and cross-component testing
- `unified-model-manager-integration.test.js` - Model manager integration tests

### `/tests/unit/`
**Unit Tests** - Individual component and function testing
- Various Jest-based unit tests

## 🚀 Running Tests

### Run All Tests by Category
```bash
# All Jest tests (unit + integration)
npm test

# Run specific test file
node tests/services/test-calculate-cost.js
node tests/api/test-oauth-callback.js
node tests/utils/test-capability-mapping.js
```

### Run Setup Scripts
```bash
# Create test user
node tests/setup/create-test-user.js

# Recreate test user
node tests/setup/recreate-test-user.js
```

### Run Ideogram Test Suite
```bash
# Complete Ideogram test suite
npm run test:ideogram

# Quick Ideogram diagnostics
npm run test:ideogram:quick
```

## 📝 Test Development Guidelines

### Naming Conventions
- **Service tests**: `test-[service-name].js`
- **API tests**: `test-[endpoint-name].js`  
- **Utility tests**: `test-[feature-name].js`
- **Setup scripts**: `[action]-test-[resource].js`

### File Organization
1. **Service tests** → `/tests/services/`
2. **API endpoint tests** → `/tests/api/`
3. **Utility/helper tests** → `/tests/utils/`
4. **Setup/data scripts** → `/tests/setup/`
5. **Feature-specific suites** → `/tests/[feature]/`

### Import Paths
All test files use relative imports from their location:
```javascript
// From any test subdirectory
const db = require('../../database');
const config = require('../../config/config');
const serviceX = require('../../services/serviceX.service');
```

## 🧪 Adding New Tests

### 1. Determine Category
- **Services** - Testing business logic, data processing, external APIs
- **API** - Testing HTTP endpoints, request/response handling
- **Utils** - Testing helper functions, utilities, formatters
- **Setup** - Database setup, test data creation, environment preparation

### 2. Create Test File
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

### 3. Update Documentation
- Add test description to appropriate directory README
- Update this main README if adding new categories

## 🔧 Troubleshooting

### Common Issues
1. **Import Errors** - Check relative path depth (`../../` for subdirectories)
2. **Database Connection** - Ensure PostgreSQL is running and accessible
3. **Environment Variables** - Check `.env` file configuration
4. **API Keys** - Verify external service API keys are configured

### Getting Help
1. Check individual directory README files for specific guidance
2. Review existing test files for patterns and examples
3. Ensure database migrations are applied
4. Verify environment configuration

---

**Last Updated**: August 3, 2025  
**Test Files**: 25+ organized across 6 categories