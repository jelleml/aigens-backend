/**
 * Tests for together.service.js
 */

const axios = require('axios');
const togetherService = require('../../services/together.service');

// Mock axios
jest.mock('axios');

// Mock config
jest.mock('../../config/config', () => ({
  together: {
    apiKey: 'mock-api-key'
  }
}));

describe('Together Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendRequest', () => {
    it('should send a request to Together.ai API with correct model ID', async () => {
      // Mock API response
      const mockApiResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'This is a test response'
              }
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20
          }
        }
      };

      axios.post.mockResolvedValueOnce(mockApiResponse);

      // Test with a direct api_model_id
      const result = await togetherService.sendRequest(
        'Test prompt',
        'mistralai/mistral-7b'
      );

      // Verify API call
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.together.ai/v1/chat/completions',
        {
          model: 'mistralai/mistral-7b',
          messages: [{ role: 'user', content: 'Test prompt' }],
          max_tokens: 2048
        },
        {
          headers: {
            'Authorization': 'Bearer mock-api-key',
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      // Verify result
      expect(result).toEqual({
        result: 'This is a test response',
        fullText: 'This is a test response',
        inputTokens: 10,
        outputTokens: 20
      });
    });

    it('should handle messages array format', async () => {
      // Mock API response
      const mockApiResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'This is a test response'
              }
            }
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 25
          }
        }
      };

      axios.post.mockResolvedValueOnce(mockApiResponse);

      // Test with messages array
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Tell me about Together.ai' }
      ];

      const result = await togetherService.sendRequest(
        messages,
        'mistralai/mistral-7b'
      );

      // Verify API call
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.together.ai/v1/chat/completions',
        {
          model: 'mistralai/mistral-7b',
          messages: messages,
          max_tokens: 2048
        },
        expect.any(Object)
      );

      // Verify result
      expect(result).toEqual({
        result: 'This is a test response',
        fullText: 'This is a test response',
        inputTokens: 15,
        outputTokens: 25
      });
    });

    it('should handle stream callback if provided', async () => {
      // Mock API response
      const mockApiResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'This is a test response'
              }
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20
          }
        }
      };

      axios.post.mockResolvedValueOnce(mockApiResponse);

      // Mock stream callback
      const mockStreamCallback = jest.fn();

      const result = await togetherService.sendRequest(
        'Test prompt',
        'mistralai/mistral-7b',
        'user123',
        'chat456',
        'chat',
        [],
        mockStreamCallback
      );

      // Verify stream callback was called
      expect(mockStreamCallback).toHaveBeenCalledWith(
        'This is a test response',
        { input_tokens: 10, output_tokens: 20 }
      );

      // Verify result
      expect(result).toEqual({
        result: 'This is a test response',
        fullText: 'This is a test response',
        inputTokens: 10,
        outputTokens: 20
      });
    });

    it('should warn about potentially invalid model ID format', async () => {
      // Mock console.warn to verify warning
      const originalConsoleWarn = console.warn;
      console.warn = jest.fn();

      // Mock API response
      const mockApiResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'This is a test response'
              }
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20
          }
        }
      };

      axios.post.mockResolvedValueOnce(mockApiResponse);

      // Test with a model ID that doesn't follow Together.ai format
      await togetherService.sendRequest(
        'Test prompt',
        'invalid-model-id'
      );

      // Verify warning was logged
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Model ID "invalid-model-id" may not be a valid Together.ai api_model_id format')
      );

      // Restore console.warn
      console.warn = originalConsoleWarn;
    });

    it('should handle API errors gracefully', async () => {
      // Mock API error
      axios.post.mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            error: {
              message: 'Model not found'
            }
          }
        }
      });

      const result = await togetherService.sendRequest(
        'Test prompt',
        'nonexistent/model'
      );

      // Verify error handling
      expect(result).toEqual({
        fullText: '',
        inputTokens: 0,
        outputTokens: 0,
        error: 'Model not found: nonexistent/model'
      });
    });

    it('should handle missing prompt', async () => {
      const result = await togetherService.sendRequest(
        '',
        'mistralai/mistral-7b'
      );

      // Verify error handling
      expect(result).toEqual({
        fullText: '',
        inputTokens: 0,
        outputTokens: 0,
        error: 'Prompt is required'
      });

      // Verify API was not called
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should handle missing model', async () => {
      const result = await togetherService.sendRequest(
        'Test prompt',
        ''
      );

      // Verify error handling
      expect(result).toEqual({
        fullText: '',
        inputTokens: 0,
        outputTokens: 0,
        error: 'Model ID is required'
      });

      // Verify API was not called
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should handle invalid message format', async () => {
      const result = await togetherService.sendRequest(
        [{ invalid: 'format' }],
        'mistralai/mistral-7b'
      );

      // Verify error handling
      expect(result).toEqual({
        fullText: '',
        inputTokens: 0,
        outputTokens: 0,
        error: 'Invalid message format: each message must have role and content'
      });

      // Verify API was not called
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should handle invalid prompt format', async () => {
      const result = await togetherService.sendRequest(
        { invalid: 'format' },
        'mistralai/mistral-7b'
      );

      // Verify error handling
      expect(result).toEqual({
        fullText: '',
        inputTokens: 0,
        outputTokens: 0,
        error: 'Invalid prompt format'
      });

      // Verify API was not called
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should handle missing API key', async () => {
      // Temporarily remove API key
      const originalApiKey = config.together.apiKey;
      config.together.apiKey = null;

      const result = await togetherService.sendRequest(
        'Test prompt',
        'mistralai/mistral-7b'
      );

      // Verify error handling
      expect(result).toEqual({
        fullText: '',
        inputTokens: 0,
        outputTokens: 0,
        error: 'Together API key not configured'
      });

      // Verify API was not called
      expect(axios.post).not.toHaveBeenCalled();

      // Restore API key
      config.together.apiKey = originalApiKey;
    });

    it('should handle invalid response structure', async () => {
      // Mock API response with invalid structure
      const mockApiResponse = {
        data: {
          // Missing choices array
        }
      };

      axios.post.mockResolvedValueOnce(mockApiResponse);

      const result = await togetherService.sendRequest(
        'Test prompt',
        'mistralai/mistral-7b'
      );

      // Verify error handling
      expect(result).toEqual({
        fullText: '',
        inputTokens: 0,
        outputTokens: 0,
        error: 'Invalid response from Together API'
      });
    });

    it('should handle various API error status codes', async () => {
      // Test 401 error
      axios.post.mockRejectedValueOnce({
        response: {
          status: 401,
          data: {}
        }
      });

      let result = await togetherService.sendRequest(
        'Test prompt',
        'mistralai/mistral-7b'
      );

      expect(result.error).toBe('Authentication failed: Invalid API key');

      // Test 400 error
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: {
              message: 'Bad request parameters'
            }
          }
        }
      });

      result = await togetherService.sendRequest(
        'Test prompt',
        'mistralai/mistral-7b'
      );

      expect(result.error).toBe('Bad request: Bad request parameters');

      // Test 429 error
      axios.post.mockRejectedValueOnce({
        response: {
          status: 429,
          data: {}
        }
      });

      result = await togetherService.sendRequest(
        'Test prompt',
        'mistralai/mistral-7b'
      );

      expect(result.error).toBe('Rate limit exceeded. Please try again later.');

      // Test 500 error
      axios.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: {}
        }
      });

      result = await togetherService.sendRequest(
        'Test prompt',
        'mistralai/mistral-7b'
      );

      expect(result.error).toBe('Together API server error. Please try again later.');
    });

    it('should handle network errors', async () => {
      // Mock network error
      axios.post.mockRejectedValueOnce(new Error('Network error'));

      const result = await togetherService.sendRequest(
        'Test prompt',
        'mistralai/mistral-7b'
      );

      // Verify error handling
      expect(result).toEqual({
        fullText: '',
        inputTokens: 0,
        outputTokens: 0,
        error: 'Network error'
      });
    });
  });
});