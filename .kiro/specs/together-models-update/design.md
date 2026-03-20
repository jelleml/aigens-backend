# Design Document

## Overview

This design outlines the implementation of an automated script to synchronize Together.ai model data with our database. The solution will ensure that the `api_model_id` field is correctly populated for all Together.ai models, enabling the service to make API calls using the correct model identifiers.

## Architecture

### Component Overview

```
Together.ai API (https://api.together.xyz/v1/models)
    ↓
┌─────────────────────────────────────────────────────────┐
│                Script Layer                             │
├─────────────────────────────────────────────────────────┤
│  update-together-models.js                            │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│                Database Layer                           │
├─────────────────────────────────────────────────────────┤
│  models table                                          │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│                Service Layer                            │
├─────────────────────────────────────────────────────────┤
│  together.service.js (improved)                       │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Model Synchronization**: Fetch Together.ai models → Compare with database → Update/Insert records
2. **Service Integration**: Use api_model_id directly for API calls

## Components and Interfaces

### 1. update-together-models.js

**Purpose**: Synchronize model data from Together.ai API with our database

**Key Functions**:
- `fetchTogetherModels()`: Retrieve models from Together.ai API
- `findExistingModel(togetherModel)`: Match Together.ai model with database record
- `updateExistingModel(dbModel, togetherModel)`: Update existing model fields
- `createNewModel(togetherModel)`: Create new model record
- `generateModelSlug(togetherModel)`: Create unique model slug
- `generateSummaryReport(results)`: Create a summary of changes

**Input**: Together.ai API response with model data
**Output**: Updated database records and summary report

### 2. Improved together.service.js

**Purpose**: Use proper API model IDs for Together.ai calls

**Key Changes**:
- Update `sendRequest()` function to use the model parameter directly
- Ensure proper error handling for invalid model IDs

## Data Models

### Together.ai API Response Structure

```javascript
[
  {
    "id": "cartesia/sonic",              // Maps to api_model_id
    "object": "model",
    "created": 0,
    "type": "audio",
    "running": false,
    "display_name": "Cartesia Sonic",    // Maps to name
    "organization": "Together",
    "link": "https://www.cartesia.ai",
    "context_length": 0,                 // Maps to max_tokens
    "config": {
      "chat_template": null,
      "stop": [],
      "bos_token": null,
      "eos_token": null
    },
    "pricing": {
      "hourly": 0,
      "input": 65,
      "output": 0,
      "base": 0,
      "finetune": 0
    }
  }
]
```

### Database Field Mappings

| Together.ai Field | Database Field | Notes |
|------------------|----------------|-------|
| `id` | `api_model_id` | Direct mapping |
| `display_name` | `name` | If name doesn't exist |
| `context_length` | `max_tokens` | If greater than 0 |
| `type` | `metadata.type` | Stored in metadata |
| `pricing` | `metadata.pricing` | Stored in metadata |

## Error Handling

### Script-Level Error Handling

1. **API Errors**: Retry logic with exponential backoff
2. **Database Errors**: Transaction rollback and detailed logging
3. **Data Validation**: Skip invalid records with warnings
4. **Network Issues**: Graceful degradation and retry mechanisms

### Service-Level Error Handling

1. **Missing api_model_id**: Use model parameter as-is
2. **Invalid Model IDs**: Clear error messages
3. **API Call Failures**: Proper error propagation

## Testing Strategy

### Unit Tests

1. **Model Matching Logic**: Test various model identification scenarios
2. **Data Transformation**: Ensure correct field mappings
3. **Error Scenarios**: Test error handling paths

### Integration Tests

1. **Database Operations**: Test CRUD operations with real data
2. **API Integration**: Mock Together.ai API responses
3. **Service Integration**: Test improved together.service.js
4. **End-to-End**: Full workflow from API to service usage

### Test Data

- Mock Together.ai API responses with various model types
- Test database with existing models for update scenarios
- Edge cases: missing fields, malformed data, network failures

## Performance Considerations

### Batch Processing

- Process models in batches to avoid memory issues
- Use database transactions for consistency
- Implement progress reporting for long-running operations

### Resource Management

- Proper database connection handling
- Memory-efficient data processing
- Graceful script termination

## Security Considerations

### API Security

- Secure storage of Together.ai API keys
- Rate limiting compliance
- Input validation and sanitization

### Database Security

- Use parameterized queries
- Validate all input data
- Implement proper access controls

## Deployment Strategy

### Script Execution

- Manual execution initially for testing
- Future automation via cron jobs or CI/CD
- Monitoring and alerting for failures

## Monitoring and Logging

### Script Monitoring

- Execution time tracking
- Success/failure rates
- Data change summaries
- Error categorization

### Service Monitoring

- API call success rates
- Model resolution accuracy
- Performance metrics
- Error tracking