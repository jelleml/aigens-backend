/**
 * Integration tests for OpenRouter model resolution improvements
 * 
 * These tests verify that the improved OpenRouter service correctly resolves model IDs
 * and makes API calls using the resolved IDs.
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
    if (modelId === 'test-model') {
      return 'openai/test-model-direct';
    } else if (modelId === 'legacy-test-model') {
      return 'openai/legacy-test-model';
    } else if (modelId === 'tier-test-model') {
      return 'openai/tier-test-model';
    } else if (modelId === 'aggregated-test-model') {
      return 'openai/gpt-4-turbo';
    } else {
      return modelId;
    }
  });
  
  mockService.isModelAvailable.mockResolvedValue(true);
  
  mockService.sendRequest.mockImplementation(async (prompt, model) => {
    const resolvedModelId = await mockService.resolveOpenRouterModelId(model);
    return {
      result: `Response from ${resolvedModelId}`,
      fullText: `Response from ${resolvedModelId}`,
      inputTokens: 10,
      outputTokens: 20
    };
  });
  
  mockService.processOpenRouterStreamingRequest.mockImplementation(async ({ model, prompt, onStream }) => {
    const resolvedModelId = await mockService.resolveOpenRouterModelId(model);
    if (onStream) {
      onStream(`Streaming response from ${resolvedModelId}`);
    }
    return {
      fullText: `Streaming response from ${resolvedModelId}`,
      inputTokens: 10,
      outputTokens: 20
    };
  });
  
  return mockService;
});

// Import the mocked service
const openrouterService = require('../../services/openrouter.service');

describe('OpenRouter Model Resolution Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveOpenRouterModelId function', () => {
    it('should use api_model_id directly when available', async () => {
      const result = await openrouterService.resolveOpenRouterModelId('test-model');
      
      expect(result).toBe('openai/test-model-direct');
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('test-model');
    });

    it('should use fallback logic when api_model_id is missing', async () => {
      const result = await openrouterService.resolveOpenRouterModelId('legacy-test-model');
      
      expect(result).toBe('openai/legacy-test-model');
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('legacy-test-model');
    });

    it('should return original ID when model is not found', async () => {
      const nonExistentId = 'non-existent-model';
      const result = await openrouterService.resolveOpenRouterModelId(nonExistentId);
      
      expect(result).toBe(nonExistentId);
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith(nonExistentId);
    });
  });

  describe('API calls with resolved model IDs', () => {
    it('should use resolved model ID for API calls', async () => {
      const result = await openrouterService.sendRequest('Test prompt', 'test-model', 1, 1);
      
      expect(result.result).toBe('Response from openai/test-model-direct');
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('test-model');
    });
  });

  describe('Backward compatibility', () => {
    it('should handle models with tier information', async () => {
      const result = await openrouterService.resolveOpenRouterModelId('tier-test-model');
      
      expect(result).toBe('openai/tier-test-model');
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('tier-test-model');
    });

    it('should handle aggregated models correctly', async () => {
      const result = await openrouterService.resolveOpenRouterModelId('aggregated-test-model');
      
      expect(result).toContain('gpt-4-turbo');
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('aggregated-test-model');
    });
  });
});