# Requirements Document

## Introduction

This feature aims to refactor the streaming API service selection logic in the messages.js file to use a database-driven approach instead of hardcoded model ID matching. The current implementation uses string matching on model IDs to determine which service to use, which is inflexible and doesn't leverage the existing database structure. The new implementation will create a centralized function to retrieve model information from the database and determine the appropriate service based on provider type, while also cleaning up the service files to focus only on streaming functionality.

## Requirements

### Requirement 1

**User Story:** As a developer, I want a centralized function to retrieve model information from the database, so that I can determine the correct service to use for streaming API calls.

#### Acceptance Criteria

1. WHEN a model_id is provided THEN the system SHALL retrieve the model information from the models table including id_model, model_slug, and api_model_id
2. WHEN retrieving model information THEN the system SHALL also fetch associated provider information through the aggregated_models table including id_aggregator_provider and id_source_provider
3. WHEN provider information is retrieved THEN the system SHALL include the provider_type field from the providers table
4. IF the model is not found in the database THEN the system SHALL throw an appropriate error message

### Requirement 2

**User Story:** As a developer, I want the system to automatically determine the correct service based on provider type, so that I don't need to maintain hardcoded model ID matching logic.

#### Acceptance Criteria

1. WHEN provider_type is "direct" OR "both" THEN the system SHALL use the corresponding PROVIDER.service.js file for that specific provider
2. WHEN provider_type is "indirect" THEN the system SHALL use either together.service.js or openrouter.service.js based on the aggregator provider
3. WHEN no appropriate service is found THEN the system SHALL throw an error indicating the model is not supported
4. WHEN multiple aggregator providers are available THEN the system SHALL use a predefined priority order to select the service

### Requirement 3

**User Story:** As a developer, I want the together.service.js and openrouter.service.js files to be cleaned up and focused only on streaming functionality, so that the codebase is more maintainable and follows single responsibility principle.

#### Acceptance Criteria

1. WHEN refactoring service files THEN the system SHALL remove all platform markup logic and cost calculation functions
2. WHEN refactoring service files THEN the system SHALL remove unused imports and variables
3. WHEN refactoring service files THEN the system SHALL keep only the core streaming functionality (sendRequest method)
4. WHEN refactoring service files THEN the system SHALL maintain the existing API interface for backward compatibility

### Requirement 4

**User Story:** As a developer, I want to replace the hardcoded model ID matching logic in messages.js with the new database-driven approach, so that the system is more flexible and maintainable.

#### Acceptance Criteria

1. WHEN processing a streaming request THEN the system SHALL call the new model information retrieval function instead of using string matching
2. WHEN the model information is retrieved THEN the system SHALL use the provider type to determine the appropriate service
3. WHEN replacing the existing logic THEN the system SHALL maintain the same functionality and error handling behavior
4. WHEN the refactoring is complete THEN the system SHALL no longer contain hardcoded model ID matching logic in the streaming section