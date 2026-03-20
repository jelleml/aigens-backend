# Model Management System Test Suite

This directory contains comprehensive tests for the model management system, including unit tests, integration tests, and performance tests.

## Test Structure

The test suite is organized into the following categories:

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test interactions between components
- **Performance Tests**: Test system behavior with large datasets and under load
- **Fixtures**: Shared test data and utilities

## Running Tests

### All Tests

```bash
npm test
```

### With Coverage Report

```bash
npm run test:coverage
```

### Specific Test Categories

```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only performance tests
npm run test:performance
```

### Watch Mode

```bash
npm run test:watch
```

### CI Mode

```bash
npm run test:ci
```

## Test Coverage

The test suite includes coverage thresholds to ensure code quality:

- **Global**: 80% branches, 85% functions, 85% lines, 85% statements
- **UnifiedModelManager**: 90% branches, 95% functions, 95% lines, 95% statements
- **Provider Adapters**: 85% branches, 90% functions, 90% lines, 90% statements
- **Utility Functions**: 80% branches, 85% functions, 85% lines, 85% statements

Coverage reports are generated in the `coverage` directory in the following formats:
- HTML: `coverage/index.html`
- LCOV: `coverage/lcov.info`
- JSON: `coverage/coverage-final.json`
- Cobertura: `coverage/cobertura-coverage.xml`
- JUnit: `coverage/junit.xml`

## Test Fixtures

The test suite includes fixtures for:

- Mock provider responses
- Database fixtures and cleanup utilities
- Performance test data generators

## Performance Testing

Performance tests verify that the system can handle large datasets efficiently:

- **Small Dataset**: 100 models, max 5 seconds processing time, max 50MB memory increase
- **Medium Dataset**: 500 models, max 15 seconds processing time, max 100MB memory increase
- **Large Dataset**: 1000 models, max 30 seconds processing time, max 200MB memory increase

## Adding New Tests

When adding new tests:

1. Follow the existing directory structure
2. Use appropriate test categories (unit, integration, performance)
3. Use shared fixtures and utilities
4. Include performance tests for performance-critical components
5. Ensure tests are isolated and don't depend on external services

## Troubleshooting

If tests are failing:

1. Check that all dependencies are installed
2. Verify that environment variables are set correctly
3. Check for database connection issues
4. Look for timeout issues in performance tests
5. Check for memory leaks in performance tests