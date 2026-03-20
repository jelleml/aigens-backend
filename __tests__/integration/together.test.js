/**
 * Integration tests for Together.ai API integration
 */

const axios = require('axios');
const { fetchTogetherModels } = require('../../scripts/update-together-models');
const db = require('../../database');
const config = require('../../config/config');

// Mock axios
jest.mock('axios');

// Mock database
jest.mock('../../database', () => ({
  models: {
    Model: {
      findOne: jest.fn(),
      create: jest.fn()
    },
    Provider: {
      findOne: jest.fn()
    }
  },
  initialize: jest.fn().mockResolvedValue(true),
  close: jest.fn().mockResolvedValue(true)
}));

// Mock config
jest.mock('../../config/config', () => ({
  together: {
    apiKey: 'mock-api-key'
  }
}));

// Mock error handler utilities
jest.mock('../../scripts/utils/error-handler', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn()
  }),
  withRetry: jest.fn().mockImplementation(fn => fn()),
  validateResponseData: jest.fn(),
  processBatches: jest.fn()
}));

describe('Together.ai API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchTogetherModels', () => {
    it('should fetch models from Together.ai API', async () => {
      // Mock API response
      const mockApiResponse = {
        data: [
          {
            id: 'mistralai/mistral-7b',
            object: 'model',
            created: 0,
            type: 'text',
            running: true,
            display_name: 'Mistral 7B',
            organization: 'MistralAI',
            link: 'https://mistral.ai',
            context_length: 8000,
            config: {
              chat_template: null,
              stop: [],
              bos_token: null,
              eos_token: null
            },
            pricing: {
              hourly: 0,
              input: 0.5,
              output: 1.5,
              base: 0,
              finetune: 0
            }
          },
          {
            id: 'meta-llama/llama-3-8b',
            object: 'model',
            created: 0,
            type: 'text',
            running: true,
            display_name: 'Llama 3 8B',
            organization: 'Meta',
            link: 'https://meta.ai',
            context_length: 8000,
            config: {
              chat_template: null,
              stop: [],
              bos_token: null,
              eos_token: null
            },
            pricing: {
              hourly: 0,
              input: 0.3,
              output: 0.9,
              base: 0,
              finetune: 0
            }
          }
        ]
      };

      axios.get.mockResolvedValueOnce(mockApiResponse);

      const models = await fetchTogetherModels();

      expect(models).toEqual(mockApiResponse.data);
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.together.xyz/v1/models',
        {
          headers: {
            'Authorization': 'Bearer mock-api-key',
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
    });

    it('should handle API errors gracefully', async () => {
      // Mock API error
      axios.get.mockRejectedValueOnce(new Error('API connection failed'));

      await expect(fetchTogetherModels()).rejects.toThrow('Failed to fetch Together.ai models: API connection failed');
    });

    it('should handle empty response', async () => {
      // Mock empty API response
      axios.get.mockResolvedValueOnce({ data: [] });

      await expect(fetchTogetherModels()).rejects.toThrow('Response data is not an array or is empty');
    });

    it('should handle invalid response format', async () => {
      // Mock invalid API response
      axios.get.mockResolvedValueOnce({ data: 'not an array' });

      await expect(fetchTogetherModels()).rejects.toThrow('Response data is not an array or is empty');
    });
  });

  describe('Together.ai API response format', () => {
    it('should validate model structure from API', async () => {
      // This test verifies that the API response structure matches our expectations
      // Mock API response with a single model
      const mockApiResponse = {
        data: [
          {
            id: 'mistralai/mistral-7b',
            object: 'model',
            created: 0,
            type: 'text',
            running: true,
            display_name: 'Mistral 7B',
            organization: 'MistralAI',
            link: 'https://mistral.ai',
            context_length: 8000,
            config: {
              chat_template: null,
              stop: [],
              bos_token: null,
              eos_token: null
            },
            pricing: {
              hourly: 0,
              input: 0.5,
              output: 1.5,
              base: 0,
              finetune: 0
            }
          }
        ]
      };

      axios.get.mockResolvedValueOnce(mockApiResponse);

      const models = await fetchTogetherModels();
      const model = models[0];

      // Verify model structure
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('display_name');
      expect(model).toHaveProperty('context_length');
      expect(model).toHaveProperty('type');
      expect(model).toHaveProperty('pricing');
      expect(model).toHaveProperty('organization');
      
      // Verify pricing structure
      expect(model.pricing).toHaveProperty('input');
      expect(model.pricing).toHaveProperty('output');
    });
  });
});