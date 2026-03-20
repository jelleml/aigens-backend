# Design Document

## Overview

This design outlines the implementation of automated scripts to synchronize OpenRouter model data and capabilities with our database, plus improvements to the OpenRouter service to use proper API model IDs. The solution consists of three main components: model synchronization, capability management, and service optimization.

## Architecture

### Component Overview

```
OpenRouter API (https://openrouter.ai/api/v1/models)
    ↓
┌─────────────────────────────────────────────────────────┐
│                Script Layer                             │
├─────────────────────────────────────────────────────────┤
│  update-openrouter-models.js                          │
│  update-capabilities-list-using-openrouter.js         │
│  populate-models-capabilities.js (enhanced)           │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│                Database Layer                           │
├─────────────────────────────────────────────────────────┤
│  models table                                          │
│  models_capabilities table                             │
│  models_models_capabilities table                      │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│                Service Layer                            │
├─────────────────────────────────────────────────────────┤
│  openrouter.service.js (improved)                     │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Model Synchronization**: Fetch OpenRouter models → Compare with database → Update/Insert records
2. **Capability Extraction**: Parse architecture data → Extract modalities → Update capabilities
3. **Service Integration**: Use api_model_id directly → Remove manual ID construction

## Components and Interfaces

### 1. update-openrouter-models.js

**Purpose**: Synchronize model data from OpenRouter API with our database

**Key Functions**:
- `fetchOpenRouterModels()`: Retrieve models from OpenRouter API
- `findExistingModel(openRouterModel)`: Match OpenRouter model with database record
- `updateExistingModel(dbModel, openRouterModel)`: Update existing model fields
- `createNewModel(openRouterModel)`: Create new model record
- `generateModelSlug(openRouterModel)`: Create unique model slug

**Input**: OpenRouter API response with model data
**Output**: Updated database records and summary report

### 2. update-capabilities-list-using-openrouter.js

**Purpose**: Extract and manage capabilities from OpenRouter architecture data

**Key Functions**:
- `extractCapabilitiesFromArchitecture(architectureData)`: Parse modalities
- `mapModalityToCapability(modality, type)`: Convert modality to capability
- `mergeWithExistingCapabilities(newCapabilities)`: Avoid duplicates
- `updateCapabilitiesTable(capabilities)`: Insert/update capabilities

**Input**: OpenRouter model architecture data
**Output**: Updated capabilities table

### 3. Enhanced populate-models-capabilities.js

**Purpose**: Link models with their capabilities based on OpenRouter data

**Key Functions**:
- `getCapabilitiesFromOpenRouterData(modelId)`: Get capabilities for specific model
- `linkModelCapabilities(modelId, capabilities)`: Create model-capability associations
- `validateCapabilityLinks()`: Ensure data integrity

**Input**: Model IDs and capability mappings
**Output**: Updated models_models_capabilities table

### 4. Improved openrouter.service.js

**Purpose**: Use proper API model IDs for OpenRouter calls

**Key Changes**:
- Remove `buildOpenRouterModelId()` function complexity
- Simplify `resolveOpenRouterModelId()` to use `api_model_id` directly
- Add fallback logic for missing `api_model_id` values

## Data Models

### OpenRouter API Response Structure

```javascript
{
  "data": [
    {
      "id": "string",                    // Maps to api_model_id
      "name": "string",                  // Maps to name
      "description": "string",           // Maps to description
      "context_length": 128000,          // Maps to max_tokens
      "architecture": {
        "modality": "text+image->text",
        "input_modalities": ["text", "image"],
        "output_modalities": ["text"],
        "tokenizer": "GPT",
        "instruct_type": "string"
      },
      "pricing": { ... },
      "top_provider": { ... }
    }
  ]
}
```

### Database Field Mappings

| OpenRouter Field | Database Field | Notes |
|------------------|----------------|-------|
| `id` | `api_model_id` | Direct mapping |
| `name` | `name` | Direct mapping |
| `description` | `description` | Direct mapping |
| `context_length` | `max_tokens` | Direct mapping |
| `architecture.input_modalities` | capabilities | Processed into capabilities |
| `architecture.output_modalities` | capabilities | Processed into capabilities |

### Capability Mapping Logic

```javascript
const modalityToCapability = {
  // Input modalities
  'text': 'Text input',
  'image': 'Image input', 
  'audio': 'Audio input',
  'video': 'Video input',
  
  // Output modalities
  'text': 'Text output',
  'image': 'Image output',
  'audio': 'Audio output'
};
```

## Error Handling

### Script-Level Error Handling

1. **API Errors**: Retry logic with exponential backoff
2. **Database Errors**: Transaction rollback and detailed logging
3. **Data Validation**: Skip invalid records with warnings
4. **Network Issues**: Graceful degradation and retry mechanisms

### Service-Level Error Handling

1. **Missing api_model_id**: Fallback to existing logic
2. **Invalid Model IDs**: Clear error messages
3. **API Call Failures**: Proper error propagation

## Testing Strategy

### Unit Tests

1. **Model Matching Logic**: Test various model identification scenarios
2. **Capability Extraction**: Verify modality parsing accuracy
3. **Data Transformation**: Ensure correct field mappings
4. **Error Scenarios**: Test error handling paths

### Integration Tests

1. **Database Operations**: Test CRUD operations with real data
2. **API Integration**: Mock OpenRouter API responses
3. **Service Integration**: Test improved openrouter.service.js
4. **End-to-End**: Full workflow from API to service usage

### Test Data

- Mock OpenRouter API responses with various model types
- Test database with existing models for update scenarios
- Edge cases: missing fields, malformed data, network failures

## Performance Considerations

### Batch Processing

- Process models in batches to avoid memory issues
- Use database transactions for consistency
- Implement progress reporting for long-running operations

### Caching Strategy

- Cache OpenRouter API responses during script execution
- Avoid redundant database queries
- Use efficient database indexes for lookups

### Resource Management

- Proper database connection handling
- Memory-efficient data processing
- Graceful script termination

## Security Considerations

### API Security

- Secure storage of OpenRouter API keys
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

### Service Updates

- Backward compatibility during transition
- Gradual rollout with monitoring
- Rollback plan for issues

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