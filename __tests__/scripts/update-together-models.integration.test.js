/**
 * Integration tests for update-together-models.js script
 */

const axios = require('axios');
const { updateTogetherModels } = require('../../scripts/update-together-models');
const db = require('../../database');

// Mock axios
jest.mock('axios');

// Mock database with more realistic behavior
jest.mock('../../database', () => {
  const mockProvider = {
    id: 2,
    name: 'together'
  };
  
  const mockModels = [
    {
      id: 1,
      model_slug: 'mistralai-mistral-7b-together',
      api_model_id: 'old-id',
      name: 'Mistral 7B',
      description: 'Old description',
      max_tokens: 8000,
      is_active: true,
      id_provider: 2,
      metadata: {},
      save: jest.fn().mockResolvedValue(true)
    },
    {
      id: 2,
      model_slug: 'meta-llama-3-8b-together',
      api_model_id: 'meta-llama/llama-3-8b',
      name: 'Llama 3 8B',
      description: 'Llama 3 model',
      max_tokens: 8000,
      is_active: true,
      id_provider: 2,
      metadata: {},
      save: jest.fn().mockResolvedValue(true)
    }
  ];
  
  return {
    initialized: false,
    initialize: jest.fn().mockImplementation(() => {
      db.initialized = true;
      return Promise.resolve(true);
    }),
    close: jest.fn().mockImplementation(() => {
      db.initialized = false;
      return Promise.resolve(true);
    }),
    models: {
      Provider: {
        findOne: jest.fn().mockImplementation(({ where }) => {
          if (where.name === 'together') {
            return Promise.resolve(mockProvider);
          }
          return Promise.resolve(null);
        })
      },
      Model: {
        findOne: jest.fn().mockImplementation(({ where }) => {
          if (where.api_model_id) {
            const model = mockModels.find(m => m.api_model_id === where.api_model_id && m.id_provider === where.id_provider);
            return Promise.resolve(model || null);
          }
          if (where.name) {
            const model = mockModels.find(m => m.name === where.name && m.id_provider === where.id_provider);
            return Promise.resolve(model || null);
          }
          if (where.model_slug) {
            const model = mockModels.find(m => m.model_slug === where.model_slug);
            return Promise.resolve(model || null);
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation((data) => {
          const newModel = {
            id: mockModels.length + 1,
            ...data,
            save: jest.fn().mockResolvedValue(true)
          };
          mockModels.push(newModel);
          return Promise.resolve(newModel);
        })
      }
    },
    sequelize: {
      models: {
        Provider: {
          findOne: jest.fn().mockImplementation(({ where }) => {
            if (where.name === 'together') {
              return Promise.resolve(mockProvider);
            }
            return Promise.resolve(null);
          })
        },
        Model: {
          findOne: jest.fn().mockImplementation(({ where }) => {
            if (where.api_model_id) {
              const model = mockModels.find(m => m.api_model_id === where.api_model_id && m.id_provider === where.id_provider);
              return Promise.resolve(model || null);
            }
            if (where.name) {
              const model = mockModels.find(m => m.name === where.name && m.id_provider === where.id_provider);
              return Promise.resolve(model || null);
            }
            if (where.model_slug) {
              const model = mockModels.find(m => m.model_slug === where.model_slug);
              return Promise.resolve(model || null);
            }
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation((data) => {
            const newModel = {
              id: mockModels.length + 1,
              ...data,
              save: jest.fn().mockResolvedValue(true)
            };
            mockModels.push(newModel);
            return Promise.resolve(newModel);
          }),
          findAll: jest.fn().mockResolvedValue([])
        }
      }
    }
  };
});

// Mock config
jest.mock('../../config/config', () => ({
  together: {
    apiKey: 'mock-api-key'
  }
}));

// Mock error handler utilities
jest.mock('../../scripts/utils/error-handler', () => {
  const originalModule = jest.requireActual('../../scripts/utils/error-handler');
  
  return {
    ...originalModule,
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn()
    }),
    withRetry: jest.fn().mockImplementation((fn) => fn()),
    processBatches: jest.fn().mockImplementation(async (items, processFn) => {
      return processFn(items, 1, 1);
    })
  };
});

describe('update-together-models.js Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process Together.ai models and update database', async () => {
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
          context_length: 16000, // Updated context length
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
        },
        {
          id: 'anthropic/claude-3-opus',
          object: 'model',
          created: 0,
          type: 'text',
          running: true,
          display_name: 'Claude 3 Opus',
          organization: 'Anthropic',
          link: 'https://anthropic.com',
          context_length: 200000,
          config: {
            chat_template: null,
            stop: [],
            bos_token: null,
            eos_token: null
          },
          pricing: {
            hourly: 0,
            input: 15,
            output: 75,
            base: 0,
            finetune: 0
          }
        }
      ]
    };

    axios.get.mockResolvedValueOnce(mockApiResponse);

    const summary = await updateTogetherModels();

    // Verify database was initialized and closed
    expect(db.initialize).toHaveBeenCalled();
    expect(db.close).toHaveBeenCalled();

    // Verify provider was fetched
    expect(db.models.Provider.findOne).toHaveBeenCalledWith({
      where: { name: 'together' }
    });

    // Verify summary contains expected data
    expect(summary).toHaveProperty('totalModelsProcessed', 3);
    expect(summary).toHaveProperty('modelsUpdated');
    expect(summary).toHaveProperty('modelsCreated');
    expect(summary).toHaveProperty('success', true);
  });

  it('should handle API errors gracefully', async () => {
    // Mock API error
    axios.get.mockRejectedValueOnce(new Error('API connection failed'));

    await expect(updateTogetherModels()).rejects.toThrow('Failed to fetch Together.ai models: API connection failed');

    // Verify database was initialized and closed even on error
    expect(db.initialize).toHaveBeenCalled();
    expect(db.close).toHaveBeenCalled();
  });

  it('should handle missing provider error', async () => {
    // Mock provider not found
    db.models.Provider.findOne.mockResolvedValueOnce(null);

    await expect(updateTogetherModels()).rejects.toThrow('Together.ai provider not found in database');

    // Verify database was initialized and closed even on error
    expect(db.initialize).toHaveBeenCalled();
    expect(db.close).toHaveBeenCalled();
  });
});