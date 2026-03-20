# Implementation Plan

- [x] 1. Implement model service information retrieval function
  - Add `getModelServiceInfo` function to `services/model.service.js`
  - Create database queries to join models, providers, and aggregated_models tables
  - Include comprehensive error handling for missing models and providers
  - Return structured object with model, provider, and aggregation information
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Implement streaming service resolution function
  - Add `resolveStreamingService` function to `services/model.service.js`
  - Create service mapping configuration for provider-to-service relationships
  - Implement logic to determine service based on provider type (direct/indirect/both)
  - Add aggregator priority handling for indirect providers
  - Include error handling for unsupported providers and missing services
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Create comprehensive unit tests for new model service functions
  - Write tests for `getModelServiceInfo` function covering valid/invalid model slugs
  - Write tests for `resolveStreamingService` function covering all provider types
  - Test error scenarios including missing models, providers, and services
  - Test aggregator priority logic and fallback scenarios
  - Create test fixtures and mock data for database interactions
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

- [x] 4. Refactor together.service.js to remove non-streaming functionality
  - Remove `calculateCost` function and related cost calculation logic
  - Remove `PLATFORM_MARKUP` constants and unused variables
  - Remove unused database model imports (User, Chat, Message, Attachment, Wallet, Transaction, MessageCost)
  - Keep only `sendRequest` method and core streaming functionality
  - Update module exports to reflect cleaned interface
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5. Refactor openrouter.service.js to remove non-streaming functionality
  - Remove `calculateCost` function and related cost calculation logic
  - Remove `PLATFORM_MARKUP` constants and unused variables
  - Remove unused database model imports (User, Chat, Message, Attachment, Wallet, Transaction, MessageCost)
  - Keep only `sendRequest` method and core streaming functionality
  - Update module exports to reflect cleaned interface
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Update service tests to reflect refactored interfaces
  - Modify `__tests__/services/together.service.test.js` to remove tests for deleted functions
  - Modify `__tests__/services/openrouter.service.test.js` to remove tests for deleted functions
  - Verify that `sendRequest` functionality tests still pass
  - Add tests to ensure removed functions are no longer available
  - _Requirements: 3.3, 3.4_

- [x] 7. Replace hardcoded model matching logic in messages.js
  - Import new `resolveStreamingService` function from model.service.js
  - Replace hardcoded if/else chain (lines 890-896) with database-driven service resolution
  - Update error handling to use new error messages from service resolution
  - Maintain existing functionality and variable names for compatibility
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 8. Create integration tests for streaming service resolution
  - Write integration test for end-to-end service resolution with database
  - Test service switching based on different provider configurations
  - Test aggregator fallback scenarios with multiple available aggregators
  - Verify backward compatibility with existing message streaming functionality
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2_

- [x] 9. Add comprehensive error handling and validation
  - Implement proper error messages for all failure scenarios
  - Add input validation for model slugs and service parameters
  - Ensure database connection error handling in service resolution
  - Add logging for service resolution decisions and errors
  - _Requirements: 1.4, 2.3, 4.3_

- [x] 10. Run full test suite and validate implementation
  - Execute all existing tests to ensure no regressions
  - Run new unit and integration tests to verify functionality
  - Test with various model types (direct, indirect, aggregated)
  - Verify that streaming functionality works correctly with new service resolution
  - Clean up any remaining unused imports or variables
  - _Requirements: 3.4, 4.3, 4.4_