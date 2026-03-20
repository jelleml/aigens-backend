# Implementation Plan

- [x] 1. Update sync engine to use IDEOGRAM_MODELS_AND_PRICING configuration
  - Modify `fetchIdeogramModels()` method in sync-engine.js to return models from the IDEOGRAM_MODELS_AND_PRICING array instead of API calls
  - Import the configuration data from update-ideogram-models.js
  - Handle the transformation from configuration format to expected API format
  - _Requirements: 1.1, 1.2_

- [x] 2. Enhance model transformation to populate pricing data
  - Update `transformIdeogramModel()` method to include pricing information from configuration
  - Create proper model data structure with all required fields (model_slug, api_model_id, name, display_name, etc.)
  - Ensure max_tokens is set to 0 for image models and other image-specific configurations
  - _Requirements: 1.2, 1.3_

- [x] 3. Implement pricing data population in models_price_score table
  - Add logic to create models_price_score records during sync process
  - Transform pricing data from individual operation fields (generate, remix, edit, etc.) to JSON format for price_image field
  - Set source to "ideogram-manual" and token prices to 0 for image models
  - Handle cases where some operations might not be available for certain models (null values)
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Implement capability mapping for Ideogram models
  - Add logic to populate models_capabilities relationship table during sync
  - Map ideogram_capabilities to all Ideogram models being synced
  - Ensure capability relationships are created after model creation
  - Handle capability lookup and relationship creation with proper error handling
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 5. Update Ideogram service to use database pricing
  - Modify `calculateCost()` method to retrieve pricing from models_price_score.price_image field
  - Implement JSON parsing for operation-specific pricing
  - Add logic to select appropriate operation pricing based on request type
  - Maintain existing fallback pricing mechanism for backward compatibility
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Add new API endpoint method stubs to Ideogram service
  - Add method stubs for /remix endpoint (image-to-image generation)
  - Add method stubs for /edit endpoint (image editing with masks)
  - Add method stubs for /reframe endpoint (aspect ratio changes)
  - Add method stubs for /replace-background endpoint (background replacement)
  - Add method stubs for /describe endpoint (image description)
  - Structure methods to follow existing service patterns without implementing full functionality
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 7. Enhance price checking script for image models
  - Update check-price-scores.js to detect image models by checking for price_image field
  - Add JSON parsing and validation for price_image data structure
  - Implement separate validation logic for image models vs text models
  - Add reporting functionality to show pricing completeness for image models
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 8. Add comprehensive error handling and logging
  - Add error handling for missing configuration data in sync engine
  - Implement transaction rollback for database errors during sync
  - Add logging for pricing data parsing errors in service layer
  - Add validation for JSON structure in price_image field with meaningful error messages
  - _Requirements: 1.4, 2.4, 3.3, 4.4_

- [ ] 9. Create unit tests for sync engine enhancements
  - Write tests for fetchIdeogramModels() returning correct configuration data
  - Write tests for transformIdeogramModel() converting data to proper format
  - Write tests for pricing data population in models_price_score table
  - Write tests for capability relationship creation
  - _Requirements: 1.1, 1.2, 2.1, 3.1_

- [ ] 10. Create unit tests for service layer changes
  - Write tests for calculateCost() using database pricing data
  - Write tests for JSON parsing of price_image field
  - Write tests for fallback pricing mechanisms
  - Write tests for new API endpoint method stubs
  - _Requirements: 4.1, 4.2, 5.1_

- [ ] 11. Create integration tests for complete sync process
  - Write end-to-end test for Ideogram model synchronization
  - Test that all models are created with correct pricing and capability data
  - Test sync idempotency (running sync multiple times produces same result)
  - Test error scenarios and recovery mechanisms
  - _Requirements: 1.1, 2.1, 3.1_

- [ ] 12. Update and test price validation integration
  - Write integration tests for price checker with mixed model types
  - Test image model detection and validation accuracy
  - Test performance with realistic dataset sizes
  - Verify reporting shows correct pricing status for image models
  - _Requirements: 6.1, 6.2, 6.3_