# Requirements Document

## Introduction

This feature aims to improve the Together.ai integration by creating an automated script to update model information based on the Together.ai API response. The system will synchronize our database with the latest Together.ai models data, ensuring that the `api_model_id` field is correctly populated for all Together.ai models.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to automatically update Together.ai model information from their API, so that our database stays synchronized with the latest model data.

#### Acceptance Criteria

1. WHEN the update-together-models.js script is executed THEN the system SHALL fetch all models from https://api.together.xyz/v1/models
2. WHEN a model already exists in our database THEN the system SHALL update the api_model_id field based on the "id" from the response
3. WHEN a model already exists in our database THEN the system SHALL update the description field if available in the response
4. WHEN a model already exists in our database THEN the system SHALL update the max_tokens field based on the "context_length" from the response
5. WHEN a model does not exist in our database THEN the system SHALL add it with is_active set to false
6. WHEN adding new models THEN the system SHALL populate all relevant fields from the Together.ai API response

### Requirement 2

**User Story:** As a developer, I want the Together.ai service to use the correct API model IDs, so that API calls work properly without manual ID construction.

#### Acceptance Criteria

1. WHEN the together.service.js makes API calls THEN it SHALL use the api_model_id field from the database
2. WHEN a model is requested THEN the service SHALL retrieve the api_model_id directly from the database
3. WHEN the api_model_id is available THEN the system SHALL use it as-is for Together.ai API calls
4. WHEN the api_model_id is not available THEN the system SHALL fall back to using the model parameter as-is

### Requirement 3

**User Story:** As a developer, I want the script to be safe and non-destructive, so that existing database data is preserved during updates.

#### Acceptance Criteria

1. WHEN the script is executed THEN it SHALL NOT delete existing model records
2. WHEN updating existing records THEN the system SHALL preserve all fields not being updated
3. WHEN errors occur during processing THEN the system SHALL log detailed error information and continue processing other records
4. WHEN the script completes THEN it SHALL provide a comprehensive summary report of changes made
5. WHEN the script is run multiple times THEN it SHALL be idempotent and not create duplicate records