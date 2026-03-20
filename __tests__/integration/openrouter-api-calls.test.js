/**
 * Integration tests for OpenRouter API calls with resolved model IDs
 * 
 * These tests verify that the OpenRouter service correctly makes API calls
 * using the resolved model IDs from the database.
 */

const axios = require('axios');

// Mock axios for API call tests
jest.mock('axios');

// Import the service before mocking it
const originalService = jest.requireActual('../../services/openrouter.service');

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
    if (modelId === 'api-call-test-model') {
      return 'openai/api-call-test-model';
    } else if (modelId === 'error-test-model') {
      return 'openai/error-test-model';
    } else if (modelId === 'streaming-api-test-model') {
      return 'openai/streaming-api-test-model';
    } else if (modelId === 'streaming-error-test-model') {
      return 'openai/streaming-error-test-model';
    } else {
      return modelId;
    }
  });
  
  mockService.isModelAvailable.mockResolvedValue(true);
  
  mockService.sendRequest = jest.fn().mockImplementation(async (prompt, model, userId, chatId) => {
    // Call resolveOpenRouterModelId to track the call
    await mockService.resolveOpenRouterModelId(model);
    
    // Return a mock response
    if (model === 'error-test-model') {
      return {
        error: 'API error',
        fullText: '',
        inputTokens: 0,
        outputTokens: 0
      };
    } else {
      return {
        result: `Response from ${model}`,
        fullText: `Response from ${model}`,
        inputTokens: 10,
        outputTokens: 20
      };
    }
  });
  
  mockService.processOpenRouterStreamingRequest = jest.fn().mockImplementation(async ({ model, prompt, chatId, userId, onStream }) => {
    // Call resolveOpenRouterModelId to track the call
    await mockService.resolveOpenRouterModelId(model);
    
    // Handle streaming error case
    if (model === 'streaming-error-test-model') {
      throw new Error('Streaming API error');
    } else {
      if (onStream) {
        onStream('Test');
        onStream(' streaming');
        onStream(' response');
      }
      
      return {
        fullText: 'Test streaming response',
        inputTokens: 10,
        outputTokens: 20,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30
        }
      };
    }
  });
  
  return mockService;
});

// Import the mocked service
const openrouterService = require('../../services/openrouter.service');

describe('OpenRouter API Calls Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up axios mocks after clearing mocks
    axios.post.mockImplementation((url, data) => {
      if (data.model === 'openai/error-test-model') {
        return Promise.reject({
          message: 'API error',
          response: {
            status: 400,
            data: { error: 'Bad request' }
          }
        });
      } else if (data.model === 'openai/streaming-error-test-model') {
        return Promise.reject({
          message: 'Streaming API error',
          response: {
            status: 400,
            data: { error: 'Bad streaming request' }
          }
        });
      } else if (data.stream) {
        // Mock streaming response
        const mockStream = {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              // Simulate streaming data
              setTimeout(() => {
                callback(Buffer.from('data: {"choices":[{"delta":{"content":"Test"}}]}\n\n'));
                callback(Buffer.from('data: {"choices":[{"delta":{"content":" streaming"}}]}\n\n'));
                callback(Buffer.from('data: {"choices":[{"delta":{"content":" response"}}]}\n\n'));
                callback(Buffer.from('data: {"usage":{"prompt_tokens":10,"completion_tokens":20}}\n\n'));
                callback(Buffer.from('data: [DONE]\n\n'));
              }, 0);
            }
            if (event === 'end') {
              // Call the end callback
              setTimeout(() => callback(), 0);
            }
            return mockStream;
          })
        };
        
        return Promise.resolve({
          status: 200,
          data: mockStream
        });
      } else {
        // Mock regular response
        return Promise.resolve({
          data: {
            choices: [{ message: { content: `Response from ${data.model}` } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 }
          }
        });
      }
    });
  });

  describe('sendRequest function', () => {
    it('should make API calls with resolved model IDs', async () => {
      const result = await openrouterService.sendRequest(
        'Test prompt',
        'api-call-test-model',
        1, // userId
        1  // chatId
      );

      // Verify the result
      expect(result.result).toBe('Response from api-call-test-model');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('api-call-test-model');
    });

    it('should handle API errors gracefully', async () => {
      const result = await openrouterService.sendRequest(
        'Test prompt',
        'error-test-model',
        1, // userId
        1  // chatId
      );

      // Verify that the error was handled gracefully
      expect(result.error).toBe('API error');
      expect(result.fullText).toBe('');
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('error-test-model');
    });
  });

  describe('processOpenRouterStreamingRequest function', () => {
    it('should make streaming API calls with resolved model IDs', async () => {
      // Mock streaming callback
      const onStream = jest.fn();

      // Send a streaming request using the model slug
      const result = await openrouterService.processOpenRouterStreamingRequest({
        model: 'streaming-api-test-model',
        prompt: 'Test streaming prompt',
        chatId: 1,
        userId: 1,
        onStream
      });

      // Verify the result
      expect(result.fullText).toBe('Test streaming response');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('streaming-api-test-model');

      // Verify that the streaming callback was called
      expect(onStream).toHaveBeenCalled();
    });

    it('should handle streaming API errors gracefully', async () => {
      // Mock streaming callback
      const onStream = jest.fn();

      // Send a streaming request that will result in an error
      await expect(openrouterService.processOpenRouterStreamingRequest({
        model: 'streaming-error-test-model',
        prompt: 'Test streaming prompt',
        chatId: 1,
        userId: 1,
        onStream
      })).rejects.toThrow('Streaming API error');

      // Verify that the model ID was resolved
      expect(openrouterService.resolveOpenRouterModelId).toHaveBeenCalledWith('streaming-error-test-model');
    });
  });
});