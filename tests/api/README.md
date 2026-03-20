# API Endpoint Tests

This directory contains tests for HTTP endpoints and API functionality.

## 📋 Test Files

### `test-oauth-callback.js`
**Purpose**: Tests OAuth callback endpoint functionality
- Validates OAuth flow completion
- Tests callback parameter handling
- Checks authentication token generation

**Usage**: `node tests/api/test-oauth-callback.js`

### `test-user-request.js`
**Purpose**: Tests user request API endpoints
- Validates user authentication and authorization
- Tests request/response formats
- Checks error handling and edge cases

**Usage**: `node tests/api/test-user-request.js`

## 🚀 Running All API Tests

```bash
# Run all API tests
for test in tests/api/*.js; do 
  echo "=== Running $(basename $test) ===" 
  node "$test"
done
```

## 🔧 Prerequisites

- Backend server running (for endpoint tests)
- Database connection configured
- Authentication configured
- Test user accounts available

## 📝 Adding New API Tests

1. Create new file: `test-[endpoint-name].js`
2. Include HTTP client setup (axios, fetch, etc.)
3. Test both success and error scenarios
4. Include proper authentication headers
5. Update this README with test description