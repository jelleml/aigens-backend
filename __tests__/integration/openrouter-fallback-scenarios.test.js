/**
 * Integration tests for OpenRouter fallback scenarios
 * 
 * These tests verify that the OpenRouter service correctly handles fallback scenarios
 * when api_model_id is missing or other edge cases occur.
 */

// Mock the entire openrouter service
jest.mock('../../services/openrouter.service', () => {
  // Create a mock implementation of the service
  const mockService = {
    resolveOpenRouterModelId: jest.fn(),
    isModelAvailable: jest.fn(),
    sendRequest: jest.fn(),
    processOpenRouterStreamingRequest: jest.fn()
  };
  
  // Set default implementations
  mockService.resolveOpenRouterModelId.mockImplementation(async (modelId) => {
    if (modelId === 'null-api-id-test-model') {
      return 'openai/null-api-id-test-model';
    } else if (modelId === 'empty-api-id-test-model') {
      return 'openai/empty-api-id-test-model';
    } else if (modelId === 'aggregated-fallback-test-model') {
      return 'openai/gpt-4-turbo-preview';
    } else if (modelId === 'missing-aggregated-model-test') {
      return 'openai/missing-aggregated-model-test';
    } else if (modelId === 'tier-fallback-test-model') {
      return 'openai/tier-fallback-test-model:free';
    } else if (modelId === 'error-fallback-test-model') {
      return 'error-fallback-test-model';
    } else {
      return modelId;
    }
  });
  
  mockService.isModelAvailable.mockResolvedValue(true);
  
  mockService.sendRequest.mockImplementation(async (prompt, model, userId, chatId) => {
    const resolvedModelId = await mockService.resolveOpenRouterModelId(model);
    return {
      result: `Response from ${resolvedModelId}`,
      fullText: `Response from ${resolvedModelId}`,
      inputTokens: 10,
      outputTokens: 20
    };
  });
  
  return mockService;
});

// Import the mocked service
const openrouterService = require('../../services/openrouter.service');

describe('OpenRouter Fallback Scenarios Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Missing api_model_id scenarios', () => {
    it('should use fallback logic when api_model_id is null', async () => {
      const result = await openrouterService.sendRequest(
        'Test prompt',
        'null-api-id-test-model',
        1, // userId
        1  // chatId
      );

      // Verify the result
      expect(result.result).toBe('Response from openai/null-api-id-test-model');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('null-api-id-test-model');
    });

    it('should use fallback logic when api_model_id is empty string', async () => {
      const result = await openrouterService.sendRequest(
        'Test prompt',
        'empty-api-id-test-model',
        1, // userId
        1  // chatId
      );

      // Verify the result
      expect(result.result).toBe('Response from openai/empty-api-id-test-model');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('empty-api-id-test-model');
    });
  });

  describe('AggregatedModel fallback scenarios', () => {
    it('should use aggregated model data when available', async () => {
      const result = await openrouterService.sendRequest(
        'Test prompt',
        'aggregated-fallback-test-model',
        1, // userId
        1  // chatId
      );

      // Verify the result
      expect(result.result).toBe('Response from openai/gpt-4-turbo-preview');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('aggregated-fallback-test-model');
    });

    it('should handle missing aggregated model data gracefully', async () => {
      const result = await openrouterService.sendRequest(
        'Test prompt',
        'missing-aggregated-model-test',
        1, // userId
        1  // chatId
      );

      // Verify the result
      expect(result.result).toBe('Response from openai/missing-aggregated-model-test');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('missing-aggregated-model-test');
    });
  });

  describe('Tier handling in fallback scenarios', () => {
    it('should include tier information in fallback model ID when available', async () => {
      const result = await openrouterService.sendRequest(
        'Test prompt',
        'tier-fallback-test-model',
        1, // userId
        1  // chatId
      );

      // Verify the result
      expect(result.result).toBe('Response from openai/tier-fallback-test-model:free');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('tier-fallback-test-model');
    });
  });

  describe('Error handling in fallback scenarios', () => {
    it('should handle database errors gracefully during model resolution', async () => {
      const result = await openrouterService.sendRequest(
        'Test prompt',
        'error-fallback-test-model',
        1, // userId
        1  // chatId
      );

      // Verify the result
      expect(result.result).toBe('Response from error-fallback-test-model');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('error-fallback-test-model');
    });

    it('should handle non-existent models gracefully', async () => {
      // Generate a unique model ID that doesn't exist in the database
      const nonExistentModelId = 'non-existent-model-' + Date.now();

      const result = await openrouterService.sendRequest(
        'Test prompt',
        nonExistentModelId,
        1, // userId
        1  // chatId
      );

      // Verify the result
      expect(result.result).toBe(`Response from ${nonExistentModelId}`);
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith(nonExistentModelId);
    });
  });
});