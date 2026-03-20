/**
 * Unit tests for update-together-models.js script
 */

const {
  findExistingModel,
  updateExistingModel,
  createNewModel,
  generateSummaryReport
} = require('../../scripts/update-together-models');

// Mock database models
const mockModel = {
  findOne: jest.fn(),
  create: jest.fn()
};

// Mock database
jest.mock('../../database', () => ({
  models: {
    Model: mockModel
  },
  initialize: jest.fn().mockResolvedValue(true),
  close: jest.fn().mockResolvedValue(true)
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

describe('update-together-models.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findExistingModel', () => {
    it('should find model by api_model_id', async () => {
      const mockDbModel = {
        id: 1,
        model_slug: 'mistral-7b-together',
        api_model_id: 'mistralai/mistral-7b'
      };
      
      mockModel.findOne.mockResolvedValueOnce(mockDbModel);
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        display_name: 'Mistral 7B'
      };
      
      const togetherProvider = { id: 2 };
      
      const result = await findExistingModel(togetherModel, togetherProvider);
      
      expect(result).toEqual(mockDbModel);
      expect(mockModel.findOne).toHaveBeenCalledWith({
        where: {
          api_model_id: 'mistralai/mistral-7b',
          id_provider: 2
        }
      });
    });
    
    it('should find model by display_name if api_model_id not found', async () => {
      const mockDbModel = {
        id: 1,
        model_slug: 'mistral-7b-together',
        name: 'Mistral 7B'
      };
      
      // First query by api_model_id returns null
      mockModel.findOne.mockResolvedValueOnce(null);
      // Second query by display_name returns the model
      mockModel.findOne.mockResolvedValueOnce(mockDbModel);
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        display_name: 'Mistral 7B'
      };
      
      const togetherProvider = { id: 2 };
      
      const result = await findExistingModel(togetherModel, togetherProvider);
      
      expect(result).toEqual(mockDbModel);
      expect(mockModel.findOne).toHaveBeenCalledTimes(2);
      expect(mockModel.findOne).toHaveBeenNthCalledWith(2, {
        where: {
          name: 'Mistral 7B',
          id_provider: 2
        }
      });
    });
    
    it('should find model by model_slug if api_model_id and display_name not found', async () => {
      const mockDbModel = {
        id: 1,
        model_slug: 'mistralai-mistral-7b-together'
      };
      
      // First query by api_model_id returns null
      mockModel.findOne.mockResolvedValueOnce(null);
      // Second query by display_name returns null
      mockModel.findOne.mockResolvedValueOnce(null);
      // Third query by model_slug returns the model
      mockModel.findOne.mockResolvedValueOnce(mockDbModel);
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        display_name: 'Mistral 7B'
      };
      
      const togetherProvider = { id: 2 };
      
      const result = await findExistingModel(togetherModel, togetherProvider);
      
      expect(result).toEqual(mockDbModel);
      expect(mockModel.findOne).toHaveBeenCalledTimes(3);
      expect(mockModel.findOne).toHaveBeenNthCalledWith(3, {
        where: {
          model_slug: 'mistralai-mistral-7b-together',
          id_provider: 2
        }
      });
    });
    
    it('should return null if no model is found', async () => {
      // All queries return null
      mockModel.findOne.mockResolvedValue(null);
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        display_name: 'Mistral 7B'
      };
      
      const togetherProvider = { id: 2 };
      
      const result = await findExistingModel(togetherModel, togetherProvider);
      
      expect(result).toBeNull();
      expect(mockModel.findOne).toHaveBeenCalledTimes(3);
    });
    
    it('should handle invalid input parameters', async () => {
      const result1 = await findExistingModel(null, { id: 2 });
      expect(result1).toBeNull();
      
      const result2 = await findExistingModel({ id: 'model' }, null);
      expect(result2).toBeNull();
      
      const result3 = await findExistingModel({}, { id: 2 });
      expect(result3).toBeNull();
    });
  });

  describe('updateExistingModel', () => {
    it('should update api_model_id if different', async () => {
      const mockDbModel = {
        id: 1,
        model_slug: 'mistral-7b-together',
        api_model_id: 'old-id',
        max_tokens: 8000,
        metadata: {},
        save: jest.fn().mockResolvedValue(true)
      };
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        context_length: 8000
      };
      
      const result = await updateExistingModel(mockDbModel, togetherModel);
      
      expect(mockDbModel.api_model_id).toBe('mistralai/mistral-7b');
      expect(mockDbModel.save).toHaveBeenCalled();
      expect(result.changes).toHaveProperty('api_model_id');
      expect(result.updated).toBe(true);
    });
    
    it('should update max_tokens if different and valid', async () => {
      const mockDbModel = {
        id: 1,
        model_slug: 'mistral-7b-together',
        api_model_id: 'mistralai/mistral-7b',
        max_tokens: 8000,
        metadata: {},
        save: jest.fn().mockResolvedValue(true)
      };
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        context_length: 16000
      };
      
      const result = await updateExistingModel(mockDbModel, togetherModel);
      
      expect(mockDbModel.max_tokens).toBe(16000);
      expect(mockDbModel.save).toHaveBeenCalled();
      expect(result.changes).toHaveProperty('max_tokens');
      expect(result.updated).toBe(true);
    });
    
    it('should update metadata with type and pricing information', async () => {
      const mockDbModel = {
        id: 1,
        model_slug: 'mistral-7b-together',
        api_model_id: 'mistralai/mistral-7b',
        max_tokens: 8000,
        metadata: {},
        save: jest.fn().mockResolvedValue(true)
      };
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        type: 'text',
        pricing: {
          input: 0.5,
          output: 1.5
        },
        organization: 'MistralAI'
      };
      
      const result = await updateExistingModel(mockDbModel, togetherModel);
      
      expect(mockDbModel.metadata).toEqual({
        type: 'text',
        pricing: {
          input: 0.5,
          output: 1.5
        },
        organization: 'MistralAI'
      });
      expect(mockDbModel.save).toHaveBeenCalled();
      expect(result.changes).toHaveProperty('metadata');
      expect(result.updated).toBe(true);
    });
    
    it('should not update if no changes are needed', async () => {
      const mockDbModel = {
        id: 1,
        model_slug: 'mistral-7b-together',
        api_model_id: 'mistralai/mistral-7b',
        max_tokens: 8000,
        metadata: {
          type: 'text',
          pricing: {
            input: 0.5,
            output: 1.5
          },
          organization: 'MistralAI'
        },
        save: jest.fn().mockResolvedValue(true)
      };
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        context_length: 8000,
        type: 'text',
        pricing: {
          input: 0.5,
          output: 1.5
        },
        organization: 'MistralAI'
      };
      
      const result = await updateExistingModel(mockDbModel, togetherModel);
      
      expect(mockDbModel.save).not.toHaveBeenCalled();
      expect(result.changes).toEqual({});
      expect(result.updated).toBe(false);
    });
    
    it('should handle invalid input parameters', async () => {
      await expect(updateExistingModel(null, { id: 'model' }))
        .rejects.toThrow('Invalid database model object');
      
      await expect(updateExistingModel({ id: 1 }, null))
        .rejects.toThrow('Invalid Together.ai model object');
      
      await expect(updateExistingModel({ id: 1 }, {}))
        .rejects.toThrow('Invalid Together.ai model object');
    });
  });

  describe('createNewModel', () => {
    it('should create a new model with correct data', async () => {
      const mockNewModel = {
        id: 1,
        model_slug: 'mistralai-mistral-7b-together',
        api_model_id: 'mistralai/mistral-7b'
      };
      
      // No existing model with this slug
      mockModel.findOne.mockResolvedValueOnce(null);
      // Create returns the new model
      mockModel.create.mockResolvedValueOnce(mockNewModel);
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        display_name: 'Mistral 7B',
        context_length: 16000,
        type: 'text',
        pricing: {
          input: 0.5,
          output: 1.5
        },
        organization: 'MistralAI'
      };
      
      const togetherProvider = { id: 2 };
      
      const result = await createNewModel(togetherModel, togetherProvider);
      
      expect(result).toEqual(mockNewModel);
      expect(mockModel.create).toHaveBeenCalledWith({
        model_slug: 'mistralai-mistral-7b-together',
        api_model_id: 'mistralai/mistral-7b',
        id_provider: 2,
        name: 'Mistral 7B',
        description: 'Together.ai model: Mistral 7B',
        max_tokens: 16000,
        is_active: false,
        metadata: expect.objectContaining({
          type: 'text',
          pricing: {
            input: 0.5,
            output: 1.5
          },
          organization: 'MistralAI',
          created_at: expect.any(String)
        })
      });
    });
    
    it('should use default values when optional fields are missing', async () => {
      const mockNewModel = {
        id: 1,
        model_slug: 'mistralai-mistral-7b-together',
        api_model_id: 'mistralai/mistral-7b'
      };
      
      // No existing model with this slug
      mockModel.findOne.mockResolvedValueOnce(null);
      // Create returns the new model
      mockModel.create.mockResolvedValueOnce(mockNewModel);
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        // No display_name
        // No context_length
      };
      
      const togetherProvider = { id: 2 };
      
      const result = await createNewModel(togetherModel, togetherProvider);
      
      expect(result).toEqual(mockNewModel);
      expect(mockModel.create).toHaveBeenCalledWith({
        model_slug: 'mistralai-mistral-7b-together',
        api_model_id: 'mistralai/mistral-7b',
        id_provider: 2,
        name: 'mistralai/mistral-7b',
        description: 'Together.ai model: mistralai/mistral-7b',
        max_tokens: 16000,
        is_active: false,
        metadata: expect.objectContaining({
          type: null,
          pricing: null,
          organization: null,
          created_at: expect.any(String)
        })
      });
    });
    
    it('should return null if model with slug already exists', async () => {
      const existingModel = {
        id: 1,
        model_slug: 'mistralai-mistral-7b-together'
      };
      
      // Existing model with this slug
      mockModel.findOne.mockResolvedValueOnce(existingModel);
      
      const togetherModel = {
        id: 'mistralai/mistral-7b',
        display_name: 'Mistral 7B'
      };
      
      const togetherProvider = { id: 2 };
      
      const result = await createNewModel(togetherModel, togetherProvider);
      
      expect(result).toBeNull();
      expect(mockModel.create).not.toHaveBeenCalled();
    });
    
    it('should handle invalid input parameters', async () => {
      await expect(createNewModel(null, { id: 2 }))
        .rejects.toThrow('Invalid Together.ai model object');
      
      await expect(createNewModel({ id: 'model' }, null))
        .rejects.toThrow('Invalid Together.ai provider object');
      
      await expect(createNewModel({}, { id: 2 }))
        .rejects.toThrow('Invalid Together.ai model object');
    });
  });

  describe('generateSummaryReport', () => {
    it('should generate a comprehensive summary report', () => {
      const results = {
        startTime: new Date(2025, 6, 18, 10, 0, 0),
        endTime: new Date(2025, 6, 18, 10, 1, 30),
        totalModelsProcessed: 50,
        modelsUpdated: [
          {
            model: {
              id: 1,
              model_slug: 'model-1'
            },
            changes: {
              api_model_id: {
                from: 'old-id',
                to: 'new-id'
              }
            }
          },
          {
            model: {
              id: 2,
              model_slug: 'model-2'
            },
            changes: {
              max_tokens: {
                from: 8000,
                to: 16000
              }
            }
          }
        ],
        modelsCreated: [
          {
            id: 3,
            model_slug: 'model-3',
            api_model_id: 'org/model-3'
          }
        ],
        errors: []
      };
      
      const summary = generateSummaryReport(results);
      
      expect(summary).toEqual({
        timestamp: expect.any(String),
        duration: 90000, // 1 minute 30 seconds in milliseconds
        totalModelsProcessed: 50,
        modelsUpdated: 2,
        modelsCreated: 1,
        errors: 0,
        success: true,
        details: {
          updatedModels: [
            {
              slug: 'model-1',
              id: 1,
              changes: {
                api_model_id: {
                  from: 'old-id',
                  to: 'new-id'
                }
              }
            },
            {
              slug: 'model-2',
              id: 2,
              changes: {
                max_tokens: {
                  from: 8000,
                  to: 16000
                }
              }
            }
          ],
          createdModels: [
            {
              slug: 'model-3',
              id: 3,
              api_model_id: 'org/model-3'
            }
          ],
          errors: []
        }
      });
    });
    
    it('should handle errors in the summary report', () => {
      const results = {
        startTime: new Date(2025, 6, 18, 10, 0, 0),
        endTime: new Date(2025, 6, 18, 10, 1, 30),
        totalModelsProcessed: 50,
        modelsUpdated: [],
        modelsCreated: [],
        errors: [
          {
            model_id: 'org/model-1',
            error: 'Database error',
            timestamp: '2025-07-18T10:00:30.000Z'
          }
        ]
      };
      
      const summary = generateSummaryReport(results);
      
      expect(summary).toEqual({
        timestamp: expect.any(String),
        duration: 90000,
        totalModelsProcessed: 50,
        modelsUpdated: 0,
        modelsCreated: 0,
        errors: 1,
        success: false,
        details: {
          updatedModels: [],
          createdModels: [],
          errors: [
            {
              model_id: 'org/model-1',
              error: 'Database error',
              timestamp: '2025-07-18T10:00:30.000Z'
            }
          ]
        }
      });
    });
  });
});