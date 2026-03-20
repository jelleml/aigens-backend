# Setup and Utility Scripts

This directory contains scripts for database setup, test data creation, and environment preparation.

## 📋 Setup Scripts

### `create-test-user.js`
**Purpose**: Creates a test user in the database
- Creates user account with test credentials
- Sets up associated wallet and permissions
- Generates authentication tokens

**Usage**: `node tests/setup/create-test-user.js`

**Output**:
- Test user created with ID and credentials
- Authentication token for API testing
- Wallet initialized with test balance

### `recreate-test-user.js`
**Purpose**: Recreates test user (deletes existing and creates new)
- Removes existing test user and associated data
- Creates fresh test user account
- Resets all test user data

**Usage**: `node tests/setup/recreate-test-user.js`

**Use Cases**:
- Clean test environment setup
- Reset test user state between test runs
- Fix corrupted test user data

## 🚀 Setup Workflow

### Initial Test Environment Setup
```bash
# 1. Create test user
node tests/setup/create-test-user.js

# 2. Verify setup (optional)
node tests/ideogram/diagnostic-ideogram.js
```

### Reset Test Environment
```bash
# Recreate test user with clean state
node tests/setup/recreate-test-user.js
```

## 🔧 Prerequisites

- Database connection configured
- Database migrations applied
- Required environment variables set

## 📝 Test User Details

The setup scripts create a standardized test user:

- **Email**: `test@example.com`
- **Username**: `testuser`
- **Password**: `testpassword123`
- **Role**: Standard user with API access
- **Wallet**: Initialized with test balance
- **Auth**: JWT token generated for API testing

## ⚠️ Important Notes

1. **Development Only**: These scripts are for development/testing only
2. **Data Cleanup**: Scripts handle cleanup of existing test data
3. **Credentials**: Test credentials are hardcoded for consistency
4. **Database**: Scripts require database connection and proper schema

## 📝 Adding New Setup Scripts

1. Create new file: `[action]-test-[resource].js`
2. Include proper cleanup logic
3. Handle existing data appropriately
4. Provide clear success/error messages
5. Update this README with script description

## 🧹 Cleanup

Test users and data can be removed by:
- Running `recreate-test-user.js` (removes old before creating new)
- Manual database cleanup if needed
- Truncating test tables (be careful!)