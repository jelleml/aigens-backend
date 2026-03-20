const axios = require('axios');
const db = require('../../database');
const {
  findExistingModel,
  updateExistingModel,
  createNewModel,
  fetchOpenRouterModels,
  CONFIG
} = require('../../scripts/update-openrouter-models');

// Mock axios
jest.mock('axios');

// Mock database
jest.mock('../../database', () => {
  const mockModel = {
    findOne: jest.fn(),
    create: jest.fn()
  };
  
  return {
    models: {
      Model: mockModel,
      Provider: {
        findOne: jest.fn()
      }
    },
    initialize: jest.fn(),
    close: jest.fn()
  };
});

// Mock config
jest.mock('../../config/config', () => ({
  openrouter: {
    apiKey: 'test-api-key'
  }
}));

describe('OpenRouter Models Update Script', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('findExistingModel', () => {
    const mockOpenRouterModel = {
      id: 'anthropic/claude-3-opus',
      name: 'Claude 3 Opus'
    };

    const mockOpenRouterProvider = {
      id: 1
    };

    test('should find model by api_model_id', async () => {
      // Mock database response
      const mockDbModel = {
        id: 1,
        model_slug: 'claude-3-opus-openrouter',
        api_model_id: 'anthropic/claude-3-opus'
      };
      
      db.models.Model.findOne.mockResolvedValueOnce(mockDbModel);
      
      const result = await findExistingModel(mockOpenRouterModel, mockOpenRouterProvider);
      
      expect(db.models.Model.findOne).toHaveBeenCalledWith({
        where: {
          api_model_id: mockOpenRouterModel.id,
          id_provider: mockOpenRouterProvider.id
        }
      });
      
      expect(result).toEqual(mockDbModel);
    });

    test('should find model by model_slug when api_model_id match fails', async () => {
      // Mock database responses
      db.models.Model.findOne.mockResolvedValueOnce(null); // First call returns null
      
      const mockDbModel = {
        id: 1,
        model_slug: 'anthropic-claude-3-opus-openrouter',
        api_model_id: null
      };
      
      db.models.Model.findOne.mockResolvedValueOnce(mockDbModel); // Second call returns model
      
      const result = await findExistingModel(mockOpenRouterModel, mockOpenRouterProvider);
      
      // Check first call
      expect(db.models.Model.findOne).toHaveBeenNthCalledWith(1, {
        where: {
          api_model_id: mockOpenRouterModel.id,
          id_provider: mockOpenRouterProvider.id
        }
      });
      
      // Check second call
      expect(db.models.Model.findOne).toHaveBeenNthCalledWith(2, {
        where: {
          model_slug: 'anthropic-claude-3-opus-openrouter',
          id_provider: mockOpenRouterProvider.id
        }
      });
      
      expect(result).toEqual(mockDbModel);
    });

    test('should find model by name when api_model_id and model_slug matches fail', async () => {
      // Mock database responses
      db.models.Model.findOne.mockResolvedValueOnce(null); // First call returns null
      db.models.Model.findOne.mockResolvedValueOnce(null); // Second call returns null
      
      const mockDbModel = {
        id: 1,
        model_slug: 'some-other-slug',
        api_model_id: null,
        name: 'Claude 3 Opus'
      };
      
      db.models.Model.findOne.mockResolvedValueOnce(mockDbModel); // Third call returns model
      
      const result = await findExistingModel(mockOpenRouterModel, mockOpenRouterProvider);
      
      // Check third call
      expect(db.models.Model.findOne).toHaveBeenNthCalledWith(3, {
        where: {
          name: mockOpenRouterModel.name,
          id_provider: mockOpenRouterProvider.id
        }
      });
      
      expect(result).toEqual(mockDbModel);
    });

    test('should return null when no matching model is found', async () => {
      // Mock database responses - all return null
      db.models.Model.findOne.mockResolvedValue(null);
      
      const result = await findExistingModel(mockOpenRouterModel, mockOpenRouterProvider);
      
      expect(result).toBeNull();
    });

    test('should handle database errors gracefully', async () => {
      // Mock database error
      db.models.Model.findOne.mockRejectedValueOnce(new Error('Database error'));
      
      const result = await findExistingModel(mockOpenRouterModel, mockOpenRouterProvider);
      
      expect(result).toBeNull();
    });
  });

  describe('updateExistingModel', () => {
    test('should update api_model_id when different', async () => {
      const mockDbModel = {
        model_slug: 'claude-3-opus-openrouter',
        api_model_id: 'old-id',
        description: 'Old description',
        max_tokens: 8000,
        save: jest.fn().mockResolvedValue(true)
      };
      
      const mockOpenRouterModel = {
        id: 'anthropic/claude-3-opus',
        description: 'Old description',
        context_length: 8000
      };
      
      const result = await updateExistingModel(mockDbModel, mockOpenRouterModel);
      
      expect(mockDbModel.api_model_id).toBe('anthropic/claude-3-opus');
      expect(mockDbModel.save).toHaveBeenCalled();
      expect(result.changes).toHaveProperty('api_model_id');
      expect(result.updated).toBe(true);
    });

    test('should update description when different', async () => {
      const mockDbModel = {
        model_slug: 'claude-3-opus-openrouter',
        api_model_id: 'anthropic/claude-3-opus',
        description: 'Old description',
        max_tokens: 8000,
        save: jest.fn().mockResolvedValue(true)
      };
      
      const mockOpenRouterModel = {
        id: 'anthropic/claude-3-opus',
        description: 'New description',
        context_length: 8000
      };
      
      const result = await updateExistingModel(mockDbModel, mockOpenRouterModel);
      
      expect(mockDbModel.description).toBe('New description');
      expect(mockDbModel.save).toHaveBeenCalled();
      expect(result.changes).toHaveProperty('description');
      expect(result.updated).toBe(true);
    });

    test('should update max_tokens when different', async () => {
      const mockDbModel = {
        model_slug: 'claude-3-opus-openrouter',
        api_model_id: 'anthropic/claude-3-opus',
        description: 'Description',
        max_tokens: 8000,
        save: jest.fn().mockResolvedValue(true)
      };
      
      const mockOpenRouterModel = {
        id: 'anthropic/claude-3-opus',
        description: 'Description',
        context_length: 16000
      };
      
      const result = await updateExistingModel(mockDbModel, mockOpenRouterModel);
      
      expect(mockDbModel.max_tokens).toBe(16000);
      expect(mockDbModel.save).toHaveBeenCalled();
      expect(result.changes).toHaveProperty('max_tokens');
      expect(result.updated).toBe(true);
    });

    test('should update multiple fields when all are different', async () => {
      const mockDbModel = {
        model_slug: 'claude-3-opus-openrouter',
        api_model_id: 'old-id',
        description: 'Old description',
        max_tokens: 8000,
        save: jest.fn().mockResolvedValue(true)
      };
      
      const mockOpenRouterModel = {
        id: 'anthropic/claude-3-opus',
        description: 'New description',
        context_length: 16000
      };
      
      const result = await updateExistingModel(mockDbModel, mockOpenRouterModel);
      
      expect(mockDbModel.api_model_id).toBe('anthropic/claude-3-opus');
      expect(mockDbModel.description).toBe('New description');
      expect(mockDbModel.max_tokens).toBe(16000);
      expect(mockDbModel.save).toHaveBeenCalled();
      expect(Object.keys(result.changes)).toHaveLength(3);
      expect(result.updated).toBe(true);
    });

    test('should not update when no fields are different', async () => {
      const mockDbModel = {
        model_slug: 'claude-3-opus-openrouter',
        api_model_id: 'anthropic/claude-3-opus',
        description: 'Description',
        max_tokens: 8000,
        save: jest.fn().mockResolvedValue(true)
      };
      
      const mockOpenRouterModel = {
        id: 'anthropic/claude-3-opus',
        description: 'Description',
        context_length: 8000
      };
      
      const result = await updateExistingModel(mockDbModel, mockOpenRouterModel);
      
      expect(mockDbModel.save).not.toHaveBeenCalled();
      expect(Object.keys(result.changes)).toHaveLength(0);
      expect(result.updated).toBe(false);
    });

    test('should handle database errors during save', async () => {
      const mockDbModel = {
        model_slug: 'claude-3-opus-openrouter',
        api_model_id: 'old-id',
        description: 'Old description',
        max_tokens: 8000,
        save: jest.fn().mockRejectedValue(new Error('Database error'))
      };
      
      const mockOpenRouterModel = {
        id: 'anthropic/claude-3-opus',
        description: 'New description',
        context_length: 16000
      };
      
      await expect(updateExistingModel(mockDbModel, mockOpenRouterModel)).rejects.toThrow('Database error');
    });
  });

  describe('createNewModel', () => {
    const mockOpenRouterModel = {
      id: 'anthropic/claude-3-opus',
      name: 'Claude 3 Opus',
      description: 'Advanced reasoning model',
      context_length: 16000
    };

    const mockOpenRouterProvider = {
      id: 1
    };

    test('should create a new model with correct data', async () => {
      // Mock database responses
      db.models.Model.findOne.mockResolvedValueOnce(null); // No existing model with same slug
      
      const mockCreatedModel = {
        id: 1,
        model_slug: 'anthropic-claude-3-opus-openrouter',
        api_model_id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        description: 'Advanced reasoning model',
        max_tokens: 16000,
        is_active: false
      };
      
      db.models.Model.create.mockResolvedValueOnce(mockCreatedModel);
      
      const result = await createNewModel(mockOpenRouterModel, mockOpenRouterProvider);
      
      expect(db.models.Model.create).toHaveBeenCalledWith({
        model_slug: 'anthropic-claude-3-opus-openrouter',
        api_model_id: 'anthropic/claude-3-opus',
        id_provider: 1,
        name: 'Claude 3 Opus',
        description: 'Advanced reasoning model',
        max_tokens: 16000,
        is_active: false
      });
      
      expect(result).toEqual(mockCreatedModel);
    });

    test('should use default values when model fields are missing', async () => {
      // Mock database responses
      db.models.Model.findOne.mockResolvedValueOnce(null); // No existing model with same slug
      
      const mockOpenRouterModelMinimal = {
        id: 'anthropic/claude-3-opus',
        // Missing name, description, context_length
      };
      
      const mockCreatedModel = {
        id: 1,
        model_slug: 'anthropic-claude-3-opus-openrouter',
        api_model_id: 'anthropic/claude-3-opus',
        name: 'anthropic/claude-3-opus',
        description: 'OpenRouter model: anthropic/claude-3-opus',
        max_tokens: 16000,
        is_active: false
      };
      
      db.models.Model.create.mockResolvedValueOnce(mockCreatedModel);
      
      const result = await createNewModel(mockOpenRouterModelMinimal, mockOpenRouterProvider);
      
      expect(db.models.Model.create).toHaveBeenCalledWith({
        model_slug: 'anthropic-claude-3-opus-openrouter',
        api_model_id: 'anthropic/claude-3-opus',
        id_provider: 1,
        name: 'anthropic/claude-3-opus',
        description: 'OpenRouter model: anthropic/claude-3-opus',
        max_tokens: 16000,
        is_active: false
      });
      
      expect(result).toEqual(mockCreatedModel);
    });

    test('should skip creation if model with same slug already exists', async () => {
      // Mock database responses
      const existingModel = {
        id: 1,
        model_slug: 'anthropic-claude-3-opus-openrouter'
      };
      
      db.models.Model.findOne.mockResolvedValueOnce(existingModel);
      
      const result = await createNewModel(mockOpenRouterModel, mockOpenRouterProvider);
      
      expect(db.models.Model.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    test('should handle database errors during creation', async () => {
      // Mock database responses
      db.models.Model.findOne.mockResolvedValueOnce(null); // No existing model with same slug
      db.models.Model.create.mockRejectedValueOnce(new Error('Database error'));
      
      await expect(createNewModel(mockOpenRouterModel, mockOpenRouterProvider)).rejects.toThrow('Database error');
    });
  });

  describe('fetchOpenRouterModels', () => {
    test('should fetch models from OpenRouter API successfully', async () => {
      // Mock axios response
      const mockApiResponse = {
        data: {
          data: [
            {
              id: 'anthropic/claude-3-opus',
              name: 'Claude 3 Opus',
              description: 'Advanced reasoning model',
              context_length: 16000
            },
            {
              id: 'anthropic/claude-3-sonnet',
              name: 'Claude 3 Sonnet',
              description: 'Balanced reasoning model',
              context_length: 8000
            }
          ]
        }
      };
      
      axios.get.mockResolvedValueOnce(mockApiResponse);
      
      const result = await fetchOpenRouterModels();
      
      expect(axios.get).toHaveBeenCalledWith(
        CONFIG.apiUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
      
      expect(result).toEqual(mockApiResponse.data.data);
      expect(result).toHaveLength(2);
    });

    test('should handle API errors with retry logic', async () => {
      // Mock axios to fail twice then succeed
      axios.get.mockRejectedValueOnce(new Error('API error 1'));
      axios.get.mockRejectedValueOnce(new Error('API error 2'));
      
      const mockApiResponse = {
        data: {
          data: [
            {
              id: 'anthropic/claude-3-opus',
              name: 'Claude 3 Opus'
            }
          ]
        }
      };
      
      axios.get.mockResolvedValueOnce(mockApiResponse);
      
      // Mock setTimeout to avoid waiting in tests
      jest.spyOn(global, 'setTimeout').mockImplementation(callback => callback());
      
      const result = await fetchOpenRouterModels();
      
      expect(axios.get).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockApiResponse.data.data);
    });

    test('should throw error after max retries', async () => {
      // Mock axios to always fail
      axios.get.mockRejectedValue(new Error('API error'));
      
      // Mock setTimeout to avoid waiting in tests
      jest.spyOn(global, 'setTimeout').mockImplementation(callback => callback());
      
      await expect(fetchOpenRouterModels()).rejects.toThrow(/Failed to fetch OpenRouter models after/);
      
      expect(axios.get).toHaveBeenCalledTimes(CONFIG.maxRetries);
    });

    test('should throw error on invalid response format', async () => {
      // Mock invalid response format
      const invalidResponse = {
        data: {
          // Missing 'data' array
          status: 'success'
        }
      };
      
      axios.get.mockResolvedValueOnce(invalidResponse);
      
      await expect(fetchOpenRouterModels()).rejects.toThrow('Invalid response format from OpenRouter API');
    });
  });
});