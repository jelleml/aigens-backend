# Utility Function Tests

This directory contains tests for helper functions, utilities, and feature implementations.

## 📋 Test Files

### `test-capability-mapping.js`
**Purpose**: Tests model capability mapping functionality
- Validates capability detection and mapping
- Tests feature compatibility checking
- Checks capability data structure integrity

**Usage**: `node tests/utils/test-capability-mapping.js`

### `test-pricing-implementation.js`
**Purpose**: Tests pricing implementation and calculations
- Validates pricing formula accuracy
- Tests different pricing models and tiers
- Checks markup and fee calculations

**Usage**: `node tests/utils/test-pricing-implementation.js`

### `test-source-detection.js`
**Purpose**: Tests source detection utility functions
- Validates source identification logic
- Tests file type and content detection
- Checks detection accuracy and edge cases

**Usage**: `node tests/utils/test-source-detection.js`

### `test-sync-engine-direct.js`
**Purpose**: Tests direct sync engine functionality
- Validates synchronization logic
- Tests data consistency and integrity
- Checks sync performance and error handling

**Usage**: `node tests/utils/test-sync-engine-direct.js`

## 🚀 Running All Utility Tests

```bash
# Run all utility tests
for test in tests/utils/*.js; do 
  echo "=== Running $(basename $test) ===" 
  node "$test"
done
```

## 🔧 Prerequisites

- Database connection configured
- Test data available
- Required configuration files present

## 📝 Adding New Utility Tests

1. Create new file: `test-[feature-name].js`
2. Focus on pure function testing
3. Include edge cases and error scenarios
4. Test with various input types and sizes
5. Update this README with test description