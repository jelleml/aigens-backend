# Requirements Document

## Introduction

This feature integrates a Python addon service for cost estimation and prompt categorization into the existing messages API. The integration will provide accurate cost estimation before processing messages and collect usage statistics for analytics purposes.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to validate user credits against accurate cost estimates before processing messages, so that users cannot exceed their available balance.

#### Acceptance Criteria

1. WHEN a message is submitted THEN the system SHALL authenticate with the Python addon service using stored credentials
2. WHEN authentication is successful THEN the system SHALL call the cost estimation endpoint with message details
3. WHEN cost estimation is received THEN the system SHALL compare the estimated cost against user's wallet balance
4. IF the user has insufficient funds THEN the system SHALL return "Fondi insufficienti" error message
5. IF the cost estimation fails THEN the system SHALL return "Errore controllo credito" error message
6. IF the model is not found in the Python service THEN the system SHALL return a specific model not found error message

### Requirement 2

**User Story:** As a system administrator, I want to collect detailed usage statistics for each message processed, so that I can analyze system usage patterns and model performance.

#### Acceptance Criteria

1. WHEN a message is processed THEN the system SHALL call the prompt categorization endpoint in the background
2. WHEN categorization data is received THEN the system SHALL store usage statistics in the models_stats_usage table
3. WHEN storing statistics THEN the system SHALL include model_id, input_length, output_length, task categories, response time, costs, and attachment information
4. IF categorization fails THEN the system SHALL continue processing but log the error
5. WHEN message processing completes THEN the system SHALL have recorded all available statistics

### Requirement 3

**User Story:** As a developer, I want a reusable Python addon service client, so that I can easily make authenticated requests to various addon endpoints.

#### Acceptance Criteria

1. WHEN the service is initialized THEN it SHALL authenticate using environment variables API_PYTHON_ADDON_USERNAME and API_PYTHON_ADDON_PASSWORD
2. WHEN authentication expires THEN the service SHALL automatically re-authenticate using stored credentials
3. WHEN making requests THEN the service SHALL include the valid access token in headers
4. IF authentication fails THEN the service SHALL throw a descriptive error
5. WHEN multiple requests are made THEN the service SHALL reuse valid tokens to avoid unnecessary authentication calls

### Requirement 4

**User Story:** As a user, I want clear error messages when cost estimation fails, so that I understand why my message cannot be processed.

#### Acceptance Criteria

1. WHEN the Python addon service is unavailable THEN the system SHALL return "Errore controllo credito" message
2. WHEN the requested model is not found THEN the system SHALL return "Model '{model_name}' not found in database" message
3. WHEN authentication fails THEN the system SHALL return "Errore controllo credito" message
4. WHEN network errors occur THEN the system SHALL return "Errore controllo credito" message
5. WHEN cost estimation succeeds THEN the system SHALL proceed with normal message processing