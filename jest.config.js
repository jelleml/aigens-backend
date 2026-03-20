/**
 * Jest configuration for model management system tests
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'services/model-management/**/*.js',
    'scripts/model-management/**/*.js',
    '!**/__tests__/**',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/*.config.js'
  ],

  // Coverage thresholds (quality gates)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // Specific thresholds for critical components
    'services/model-management/unified-model-manager.js': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    },
    'services/model-management/adapters/*.js': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    },
    'services/model-management/utils/*.js': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },

  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json',
    'cobertura'
  ],

  // Coverage directory
  coverageDirectory: 'coverage',

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup/jest.setup.js'
  ],

  // Test timeout
  testTimeout: 30000,

  // Module paths
  moduleDirectories: [
    'node_modules',
    '<rootDir>'
  ],

  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },

  // Module name mapping for mocks
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@tests/(.*)$': '<rootDir>/__tests__/$1'
  },

  // Test categories
  projects: [
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/__tests__/services/**/*.test.js',
        '<rootDir>/__tests__/scripts/**/*.test.js'
      ],
      testPathIgnorePatterns: [
        '<rootDir>/__tests__/integration/',
        '<rootDir>/__tests__/performance/'
      ]
    },
    {
      displayName: 'integration',
      testMatch: [
        '<rootDir>/__tests__/integration/**/*.test.js'
      ],
      testTimeout: 60000
    },
    {
      displayName: 'performance',
      testMatch: [
        '<rootDir>/__tests__/performance/**/*.test.js'
      ],
      testTimeout: 120000,
      // Performance tests don't contribute to coverage
      collectCoverage: false
    }
  ],

  // Global setup and teardown
  globalSetup: '<rootDir>/__tests__/setup/global-setup.js',
  globalTeardown: '<rootDir>/__tests__/setup/global-teardown.js',

  // Verbose output for CI
  verbose: process.env.CI === 'true',

  // Fail fast in CI
  bail: process.env.CI === 'true' ? 1 : 0,

  // Force exit to prevent hanging
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Error on deprecated features
  errorOnDeprecated: true,

  // Notify mode for watch
  notify: false,

  // Watch plugins
  // watchPlugins: [
  //   'jest-watch-typeahead/filename',
  //   'jest-watch-typeahead/testname'
  // ],

  // Reporter configuration
  reporters: ['default']
};