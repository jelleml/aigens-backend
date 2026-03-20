# Requirements Document

## Introduction

This feature aims to improve the OpenRouter integration by creating automated scripts to update model information and capabilities based on the OpenRouter API response. The system will synchronize our database with the latest OpenRouter models data and enhance our capabilities tracking system.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to automatically update OpenRouter model information from their API, so that our database stays synchronized with the latest model data.

#### Acceptance Criteria

1. WHEN the update-openrouter-models.js script is executed THEN the system SHALL fetch all models from https://openrouter.ai/api/v1/models
2. WHEN a model already exists in our database THEN the system SHALL update the api_model_id field based on the "id" from the response
3. WHEN a model already exists in our database THEN the system SHALL update the description field based on the "description" from the response
4. WHEN a model already exists in our database THEN the system SHALL update the max_tokens field based on the "context_length" from the response
5. WHEN a model does not exist in our database THEN the system SHALL add it with is_active set to false
6. WHEN adding new models THEN the system SHALL populate all relevant fields from the OpenRouter API response

### Requirement 2

**User Story:** As a system administrator, I want to automatically update model capabilities based on OpenRouter architecture data, so that our capabilities system reflects the actual model features.

#### Acceptance Criteria

1. WHEN the update-capabilities-list-using-openrouter.js script is executed THEN the system SHALL analyze the "architecture" field from OpenRouter models
2. WHEN new input/output modalities are found THEN the system SHALL add them to the capabilities table if they don't exist
3. WHEN capabilities are updated THEN the system SHALL merge with existing capabilities without duplicating
4. WHEN the populate-models-capabilities.js script is enhanced THEN it SHALL use the updated capabilities from OpenRouter data
5. WHEN capabilities are processed THEN the system SHALL handle text, image, audio, and other modality types correctly

### Requirement 3

**User Story:** As a developer, I want the OpenRouter service to use the correct API model IDs, so that API calls work properly without manual ID construction.

#### Acceptance Criteria

1. WHEN the openrouter.service.js resolves model IDs THEN it SHALL use the api_model_id field from the database
2. WHEN making API calls to OpenRouter THEN the system SHALL NOT construct model IDs by adding provider prefixes to slugs
3. WHEN a model is requested THEN the service SHALL retrieve the api_model_id directly from the database
4. WHEN the api_model_id is available THEN the system SHALL use it as-is for OpenRouter API calls
5. WHEN the api_model_id is not available THEN the system SHALL fall back to existing logic as a safety measure

### Requirement 4

**User Story:** As a developer, I want the scripts to be safe and non-destructive, so that existing database data is preserved during updates.

#### Acceptance Criteria

1. WHEN scripts are executed THEN they SHALL NOT delete existing model or capability records
2. WHEN updating existing records THEN the system SHALL preserve all fields not being updated
3. WHEN errors occur during processing THEN the system SHALL log detailed error information and continue processing other records
4. WHEN scripts complete THEN they SHALL provide comprehensive summary reports of changes made
5. WHEN scripts are run multiple times THEN they SHALL be idempotent and not create duplicate records