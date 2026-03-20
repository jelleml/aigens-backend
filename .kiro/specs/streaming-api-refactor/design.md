# Design Document

## Overview

This design refactors the streaming API service selection logic from hardcoded model ID matching to a database-driven approach. The solution introduces a new service resolution function that queries the database to determine the appropriate service based on model and provider information, while cleaning up existing service files to focus solely on streaming functionality.

## Architecture

### Current Architecture Issues
- Hardcoded model ID matching in messages.js (lines 890-896)
- Service files contain unnecessary platform markup and cost calculation logic
- No centralized way to determine service based on database provider configuration
- Inflexible system that requires code changes for new models

### New Architecture
- Database-driven service resolution through a new `getModelServiceInfo` function
- Clean separation of concerns with services focused only on streaming
- Centralized service mapping based on provider types
- Flexible system that adapts to database configuration changes

## Components and Interfaces

### 1. Model Service Resolution Function

**Location:** `services/model.service.js`

**Function:** `getModelServiceInfo(modelSlug)`

**Purpose:** Retrieve comprehensive model and provider information to determine the appropriate streaming service.

**Input:**
- `modelSlug` (string): The model identifier to look up

**Output:**
```javascript
{
  model: {
    id: number,
    model_slug: string,
    api_model_id: string,
    id_provider: number
  },
  provider: {
    id: number,
    name: string,
    provider_type: 'direct' | 'indirect' | 'both' | 'aggregator'
  },
  aggregatedInfo: {
    id_aggregator_provider: number,
    id_source_provider: number,
    aggregatorProvider: {
      name: string,
      provider_type: string
    },
    sourceProvider: {
      name: string,
      provider_type: string
    }
  } | null
}
```

**Database Queries:**
1. Query `models` table for model information
2. Join with `providers` table for provider details
3. Left join with `aggregated_models` table for aggregation relationships
4. Include related provider information for aggregated models

### 2. Service Resolution Logic

**Location:** `services/model.service.js`

**Function:** `resolveStreamingService(modelSlug)`

**Purpose:** Determine which service file to use based on model and provider information.

**Logic Flow:**
1. Call `getModelServiceInfo(modelSlug)`
2. Analyze provider type and aggregation status
3. Return service name and configuration

**Service Resolution Rules:**
- **Direct Provider (`provider_type: 'direct'` or `'both'`):** Use `{providerName}.service.js`
- **Indirect Provider (`provider_type: 'indirect'`):** Use aggregator service based on `aggregated_models` table
- **Aggregator Priority:** together.service.js > openrouter.service.js (configurable)

### 3. Service File Refactoring

**Files to Refactor:**
- `services/together.service.js`
- `services/openrouter.service.js`

**Changes:**
- Remove `calculateCost` function
- Remove `PLATFORM_MARKUP` constants
- Remove unused imports (User, Chat, Message, Attachment, Wallet, Transaction, MessageCost)
- Keep only core streaming functionality
- Maintain existing `sendRequest` method signature for compatibility

**Cleaned Interface:**
```javascript
module.exports = {
  sendRequest,
  // Remove: calculateCost, initializeModels, getAvailableModels, isModelAvailable
}
```

### 4. Messages.js Integration

**Location:** `api/v1/messages.js` (lines 890-896)

**Current Code:**
```javascript
if (model_id.includes('claude')) aiService = anthropicService;
else if (model_id.includes('gpt-')) aiService = openaiService;
else if (model_id.includes('deepseek')) aiService = deepseekService;
else if (model_id.includes('meta-llama') || model_id.includes('mistralai') || model_id.includes('Qwen')) aiService = togetherService;
else if (model_id.startsWith('ideogram-')) aiService = ideogramService;
else if (model_id.includes('google-gemini') || model_id.includes('gemini')) aiService = openrouterService;
else throw new Error('Modello non supportato');
```

**New Code:**
```javascript
const { resolveStreamingService } = require('../../services/model.service');
const serviceInfo = await resolveStreamingService(model_id);
const aiService = serviceInfo.service;
```

## Data Models

### Database Tables Used

**models table:**
- `id` (primary key)
- `model_slug` (unique identifier)
- `api_model_id` (API-specific model ID)
- `id_provider` (foreign key to providers)

**providers table:**
- `id` (primary key)
- `name` (provider name)
- `provider_type` (direct/indirect/both/aggregator)

**aggregated_models table:**
- `id_aggregator_provider` (foreign key to providers)
- `id_source_provider` (foreign key to providers)
- `id_model` (foreign key to models)
- `source_model_id` (original model identifier)

### Service Mapping Configuration

**Provider to Service Mapping:**
```javascript
const SERVICE_MAPPING = {
  'anthropic': 'anthropicService',
  'openai': 'openaiService',
  'deepseek': 'deepseekService',
  'ideogram': 'ideogramService',
  'together': 'togetherService',
  'openrouter': 'openrouterService'
};
```

**Aggregator Priority:**
```javascript
const AGGREGATOR_PRIORITY = ['together', 'openrouter'];
```

## Error Handling

### Error Scenarios and Responses

1. **Model Not Found:**
   - Throw: `Error('Model not found: {modelSlug}')`

2. **Provider Not Found:**
   - Throw: `Error('Provider not found for model: {modelSlug}')`

3. **Service Not Available:**
   - Throw: `Error('No streaming service available for provider: {providerName}')`

4. **Multiple Aggregators Available:**
   - Use priority order, log selection decision

5. **Database Connection Issues:**
   - Throw: `Error('Database error while resolving service: {error.message}')`

## Testing Strategy

### Unit Tests

**Test File:** `__tests__/services/model.service.test.js`

**Test Cases:**
1. `getModelServiceInfo` function:
   - Valid model slug returns complete information
   - Invalid model slug throws appropriate error
   - Aggregated model returns aggregation information
   - Direct provider model returns provider information

2. `resolveStreamingService` function:
   - Direct provider resolves to correct service
   - Indirect provider resolves to aggregator service
   - Multiple aggregators use priority order
   - Invalid model throws appropriate error

**Test File:** `__tests__/api/messages.test.js`

**Test Cases:**
1. Integration test for streaming service resolution
2. Backward compatibility with existing functionality
3. Error handling for unsupported models

### Integration Tests

**Test File:** `__tests__/integration/streaming-service-resolution.test.js`

**Test Cases:**
1. End-to-end service resolution with database
2. Service switching based on provider configuration
3. Aggregator fallback scenarios

### Service File Tests

**Updated Test Files:**
- `__tests__/services/together.service.test.js`
- `__tests__/services/openrouter.service.test.js`

**Test Cases:**
1. Verify removed functions are no longer available
2. Verify `sendRequest` functionality remains intact
3. Verify clean interface exports

## Implementation Considerations

### Performance
- Cache service resolution results to avoid repeated database queries
- Use database indexes on frequently queried fields (model_slug, provider_type)
- Consider connection pooling for database operations

### Backward Compatibility
- Maintain existing service method signatures
- Preserve error message formats where possible
- Ensure existing tests continue to pass

### Configuration Management
- Service mapping and aggregator priority should be configurable
- Consider environment-specific service preferences
- Allow for dynamic service availability checking

### Monitoring and Logging
- Log service resolution decisions for debugging
- Track service usage patterns
- Monitor database query performance

## Migration Strategy

### Phase 1: Add New Functions
1. Implement `getModelServiceInfo` in model.service.js
2. Implement `resolveStreamingService` in model.service.js
3. Add comprehensive tests for new functions

### Phase 2: Clean Service Files
1. Remove unnecessary functions from together.service.js
2. Remove unnecessary functions from openrouter.service.js
3. Update service tests to reflect changes

### Phase 3: Update Messages.js
1. Replace hardcoded logic with new service resolution
2. Update error handling to use new error messages
3. Test integration thoroughly

### Phase 4: Validation and Cleanup
1. Run full test suite to ensure no regressions
2. Remove any unused imports or variables
3. Update documentation and comments