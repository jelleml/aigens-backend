# Service Layer Tests

This directory contains tests for individual services and business logic components.

## 📋 Test Files

### `test-calculate-cost.js`
**Purpose**: Validates the cost calculation service functionality
- Tests cost calculation methods
- Validates pricing logic accuracy
- Checks fee and markup calculations

**Usage**: `node tests/services/test-calculate-cost.js`

### `test-openrouter-api.js`
**Purpose**: Tests OpenRouter API integration
- Validates API key configuration
- Tests API connectivity and responses
- Checks model availability through OpenRouter

**Usage**: `node tests/services/test-openrouter-api.js`

### `test-together-api.js`
**Purpose**: Tests Together AI API integration  
- Validates API connection and authentication
- Tests model listing and availability
- Checks API response formats

**Usage**: `node tests/services/test-together-api.js`

## 🚀 Running All Service Tests

```bash
# Run all service tests
for test in tests/services/*.js; do 
  echo "=== Running $(basename $test) ===" 
  node "$test"
done
```

## 🔧 Prerequisites

- Database connection configured
- API keys set in environment variables:
  - `OPENROUTER_API_KEY`
  - `TOGETHER_API_KEY`
- Required services accessible

## 📝 Adding New Service Tests

1. Create new file: `test-[service-name].js`
2. Follow the established test pattern
3. Include proper error handling and cleanup
4. Update this README with test description