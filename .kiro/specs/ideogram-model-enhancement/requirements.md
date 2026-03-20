# Requirements Document

## Introduction

This feature enhances the Ideogram model management system to fully integrate with the existing model management infrastructure. The enhancement focuses on proper pricing configuration, capability mapping, and service integration for Ideogram's image generation models. Unlike other providers, Ideogram requires direct integration and has unique pricing structures for different image operations (Generate, Remix, Edit, Reframe, Replace BG).

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want Ideogram models to be properly initialized through the model management system, so that they integrate seamlessly with the existing provider infrastructure.

#### Acceptance Criteria

1. WHEN the model sync engine runs THEN it SHALL populate Ideogram models from the IDEOGRAM_MODELS_AND_PRICING configuration
2. WHEN Ideogram models are synced THEN the system SHALL create entries in the models table with proper configuration
3. WHEN Ideogram models are initialized THEN they SHALL follow the same patterns as other providers in the model management system
4. IF the sync process encounters errors THEN it SHALL log appropriate error messages and continue processing other models

### Requirement 2

**User Story:** As a cost management system, I want Ideogram model pricing to be stored in a flexible JSON format, so that different image operation types can have distinct pricing.

#### Acceptance Criteria

1. WHEN Ideogram models are synced THEN the system SHALL populate the models_price_score table with source "ideogram-manual"
2. WHEN storing Ideogram pricing THEN the system SHALL save pricing data in the price_image field as a JSON string
3. WHEN pricing is stored THEN the JSON SHALL contain operation-specific prices like {"Generate": "0.18", "Remix": "0.18", "Edit": "0.18", "Reframe": "0.18", "Replace BG": "0.18"}
4. WHEN the pricing structure is designed THEN it SHALL be flexible enough to support future video pricing extensions

### Requirement 3

**User Story:** As a capability management system, I want Ideogram model capabilities to be properly mapped, so that the system knows what each model can do.

#### Acceptance Criteria

1. WHEN Ideogram models are synced THEN the system SHALL populate the models_capabilities relationship table
2. WHEN capabilities are assigned THEN all Ideogram models SHALL receive the capabilities defined in ideogram_capabilities
3. WHEN capability mapping occurs THEN it SHALL follow the same pattern as other providers
4. IF capabilities are missing THEN the system SHALL log warnings but continue processing

### Requirement 4

**User Story:** As the Ideogram service, I want to use the centralized pricing and configuration data, so that I don't need to maintain separate pricing logic.

#### Acceptance Criteria

1. WHEN the Ideogram service calculates costs THEN it SHALL retrieve pricing from the models_price_score table
2. WHEN pricing is retrieved THEN the service SHALL parse the JSON pricing data from the price_image field
3. WHEN API calls are made THEN the service SHALL use the operation-specific pricing for cost calculations
4. WHEN the service is updated THEN existing API call functionality and input/output management SHALL remain unchanged

### Requirement 5

**User Story:** As the Ideogram service, I want to support all available API endpoints, so that users can access the full range of Ideogram functionality.

#### Acceptance Criteria

1. WHEN the service is enhanced THEN it SHALL support the /generate endpoint for text-to-image generation
2. WHEN the service is enhanced THEN it SHALL support the /remix endpoint for image-to-image generation
3. WHEN the service is enhanced THEN it SHALL support the /edit endpoint for image editing with masks
4. WHEN the service is enhanced THEN it SHALL support the /reframe endpoint for aspect ratio changes
5. WHEN the service is enhanced THEN it SHALL support the /replace-background endpoint for background replacement
6. WHEN the service is enhanced THEN it SHALL support the /describe endpoint for image description
7. WHEN new endpoints are added THEN they SHALL follow the existing service patterns for error handling and response formatting

### Requirement 6

**User Story:** As the price checking system, I want to validate image model pricing, so that pricing accuracy is maintained across all model types.

#### Acceptance Criteria

1. WHEN the price checking script runs THEN it SHALL check pricing for image models in the price_image column
2. WHEN image model prices are validated THEN the system SHALL parse and validate the JSON pricing structure
3. WHEN price validation occurs THEN it SHALL report any missing or invalid pricing data
4. WHEN the price checker encounters image models THEN it SHALL use different validation logic than text models