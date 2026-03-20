/**
 * Mock provider responses for testing
 * Contains realistic mock data for all supported AI providers
 * 
 * This file provides standardized mock responses for all provider APIs
 * to ensure consistent and reliable testing across the application.
 * 
 * @module mock-provider-responses
 */

/**
 * Mock provider API responses for different scenarios
 * @type {Object}
 */
const mockProviderResponses = {
  openai: {
    success: {
      data: [
        {
          id: 'gpt-4',
          object: 'model',
          created: 1687882411,
          owned_by: 'openai'
        },
        {
          id: 'gpt-4-turbo',
          object: 'model',
          created: 1687882411,
          owned_by: 'openai'
        },
        {
          id: 'gpt-3.5-turbo',
          object: 'model',
          created: 1677610602,
          owned_by: 'openai'
        }
      ]
    },
    error: {
      error: {
        message: 'Invalid API key provided',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      }
    },
    timeout: null, // Simulates timeout
    rateLimit: {
      error: {
        message: 'Rate limit exceeded',
        type: 'requests',
        code: 'rate_limit_exceeded'
      }
    }
  },

  anthropic: {
    success: [
      {
        id: 'claude-3-opus-20240229',
        display_name: 'Claude 3 Opus',
        created_at: '2024-02-29T00:00:00Z'
      },
      {
        id: 'claude-3-sonnet-20240229',
        display_name: 'Claude 3 Sonnet',
        created_at: '2024-02-29T00:00:00Z'
      },
      {
        id: 'claude-3-haiku-20240307',
        display_name: 'Claude 3 Haiku',
        created_at: '2024-03-07T00:00:00Z'
      }
    ],
    error: {
      error: {
        type: 'authentication_error',
        message: 'Invalid API key'
      }
    },
    timeout: null,
    rateLimit: {
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit exceeded'
      }
    }
  },

  together: {
    success: [
      {
        id: 'meta-llama/Llama-2-70b-chat-hf',
        object: 'model',
        created: 1677610602,
        owned_by: 'Meta',
        pricing: {
          input: 0.0009,
          output: 0.0009
        }
      },
      {
        id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
        object: 'model',
        created: 1677610602,
        owned_by: 'Mistral AI',
        pricing: {
          input: 0.0006,
          output: 0.0006
        }
      }
    ],
    error: {
      error: 'Invalid API key'
    },
    timeout: null,
    rateLimit: {
      error: 'Rate limit exceeded'
    }
  },

  openrouter: {
    success: {
      data: [
        {
          id: 'openai/gpt-4',
          name: 'GPT-4',
          description: 'OpenAI GPT-4',
          pricing: {
            prompt: '0.00003',
            completion: '0.00006'
          },
          context_length: 8192,
          architecture: {
            modality: 'text',
            tokenizer: 'cl100k_base',
            instruct_type: null
          },
          top_provider: {
            max_completion_tokens: null,
            is_moderated: true
          },
          per_request_limits: null
        },
        {
          id: 'anthropic/claude-3-opus',
          name: 'Claude 3 Opus',
          description: 'Anthropic Claude 3 Opus',
          pricing: {
            prompt: '0.000015',
            completion: '0.000075'
          },
          context_length: 200000,
          architecture: {
            modality: 'text',
            tokenizer: 'claude',
            instruct_type: null
          },
          top_provider: {
            max_completion_tokens: 4096,
            is_moderated: false
          },
          per_request_limits: null
        }
      ]
    },
    error: {
      error: {
        code: 401,
        message: 'Invalid API key'
      }
    },
    timeout: null,
    rateLimit: {
      error: {
        code: 429,
        message: 'Rate limit exceeded'
      }
    }
  },

  deepseek: {
    success: {
      data: [
        {
          id: 'deepseek-chat',
          object: 'model',
          created: 1677610602,
          owned_by: 'deepseek'
        },
        {
          id: 'deepseek-coder',
          object: 'model',
          created: 1677610602,
          owned_by: 'deepseek'
        }
      ]
    },
    error: {
      error: {
        message: 'Invalid API key',
        type: 'invalid_request_error'
      }
    },
    timeout: null,
    rateLimit: {
      error: {
        message: 'Rate limit exceeded',
        type: 'rate_limit_error'
      }
    }
  },

  ideogram: {
    success: [
      {
        id: 'ideogram-v1',
        name: 'Ideogram V1',
        description: 'Ideogram image generation model',
        type: 'image'
      },
      {
        id: 'ideogram-v2',
        name: 'Ideogram V2',
        description: 'Ideogram image generation model v2',
        type: 'image'
      }
    ],
    error: {
      error: 'Authentication failed'
    },
    timeout: null,
    rateLimit: {
      error: 'Rate limit exceeded'
    }
  }
};

/**
 * Generate mock HTTP responses for different scenarios
 */
const mockHttpResponses = {
  success: (data) => ({
    status: 200,
    data: data,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-remaining': '100'
    }
  }),

  error: (errorData, status = 400) => ({
    status: status,
    data: errorData,
    headers: {
      'content-type': 'application/json'
    }
  }),

  timeout: () => {
    const error = new Error('timeout of 30000ms exceeded');
    error.code = 'ECONNABORTED';
    error.config = { timeout: 30000 };
    throw error;
  },

  rateLimit: (errorData) => ({
    status: 429,
    data: errorData,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-remaining': '0',
      'retry-after': '60'
    }
  }),

  serverError: () => ({
    status: 500,
    data: { error: 'Internal server error' },
    headers: {
      'content-type': 'application/json'
    }
  }),

  networkError: () => {
    const error = new Error('Network Error');
    error.code = 'ECONNRESET';
    throw error;
  }
};

/**
 * Mock database records for testing
 */
const mockDatabaseRecords = {
  providers: [
    {
      id: 1,
      name: 'openai',
      display_name: 'OpenAI',
      api_url: 'https://api.openai.com/v1',
      is_active: true
    },
    {
      id: 2,
      name: 'anthropic',
      display_name: 'Anthropic',
      api_url: 'https://api.anthropic.com/v1',
      is_active: true
    },
    {
      id: 3,
      name: 'together',
      display_name: 'Together AI',
      api_url: 'https://api.together.xyz/v1',
      is_active: true
    },
    {
      id: 4,
      name: 'openrouter',
      display_name: 'OpenRouter',
      api_url: 'https://openrouter.ai/api/v1',
      is_active: true
    },
    {
      id: 5,
      name: 'deepseek',
      display_name: 'DeepSeek',
      api_url: 'https://api.deepseek.com/v1',
      is_active: true
    },
    {
      id: 6,
      name: 'ideogram',
      display_name: 'Ideogram',
      api_url: 'https://api.ideogram.ai/v1',
      is_active: true
    }
  ],

  models: [
    {
      id: 1,
      model_slug: 'gpt-4-openai',
      api_model_id: 'gpt-4',
      id_provider: 1,
      name: 'GPT-4',
      description: 'OpenAI GPT-4 model',
      max_tokens: 8192,
      is_active: true,
      last_updated_at: new Date(),
      sync_status: 'synced'
    },
    {
      id: 2,
      model_slug: 'claude-3-opus-anthropic',
      api_model_id: 'claude-3-opus-20240229',
      id_provider: 2,
      name: 'Claude 3 Opus',
      description: 'Anthropic Claude 3 Opus',
      max_tokens: 200000,
      is_active: true,
      last_updated_at: new Date(),
      sync_status: 'synced'
    }
  ],

  modelPriceScores: [
    {
      id: 1,
      id_model: 1,
      price_1m_input_tokens: 30,
      price_1m_output_tokens: 60,
      created_at: new Date()
    },
    {
      id: 2,
      id_model: 2,
      price_1m_input_tokens: 15,
      price_1m_output_tokens: 75,
      created_at: new Date()
    }
  ],

  syncLogs: [
    {
      id: 1,
      provider_name: 'openai',
      sync_type: 'update',
      started_at: new Date(Date.now() - 3600000),
      completed_at: new Date(Date.now() - 3500000),
      status: 'completed',
      models_processed: 10,
      models_created: 2,
      models_updated: 8,
      errors_count: 0,
      execution_time_ms: 60000
    }
  ],

  healthStatus: [
    {
      id: 1,
      provider_name: 'openai',
      last_check_at: new Date(),
      status: 'healthy',
      response_time_ms: 250,
      consecutive_failures: 0
    },
    {
      id: 2,
      provider_name: 'anthropic',
      last_check_at: new Date(Date.now() - 300000),
      status: 'degraded',
      response_time_ms: 2500,
      consecutive_failures: 1,
      error_message: 'Slow response time'
    }
  ]
};

/**
 * Performance test data generators
 */
const generateLargeDataset = {
  models: (count = 1000) => {
    const models = [];
    for (let i = 0; i < count; i++) {
      models.push({
        id: `model-${i}`,
        name: `Test Model ${i}`,
        description: `Generated test model ${i}`,
        pricing: {
          input: Math.random() * 0.01,
          output: Math.random() * 0.01
        }
      });
    }
    return models;
  },

  providers: (count = 50) => {
    const providers = [];
    for (let i = 0; i < count; i++) {
      providers.push({
        id: i + 1,
        name: `provider-${i}`,
        display_name: `Test Provider ${i}`,
        api_url: `https://api.provider${i}.com/v1`,
        is_active: true
      });
    }
    return providers;
  }
};

/**
 * Mock response factory for creating custom test scenarios
 */
class MockResponseFactory {
  /**
   * Create a custom provider response
   * @param {string} provider - Provider name
   * @param {string} scenario - Scenario type (success, error, timeout, rateLimit)
   * @param {Object} customData - Custom data to merge with default response
   * @returns {Object} Custom mock response
   */
  static createProviderResponse(provider, scenario, customData = {}) {
    if (!mockProviderResponses[provider]) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    
    if (!mockProviderResponses[provider][scenario]) {
      throw new Error(`Unknown scenario: ${scenario} for provider ${provider}`);
    }
    
    const baseResponse = mockProviderResponses[provider][scenario];
    
    if (Array.isArray(baseResponse)) {
      return [...baseResponse, ...customData];
    }
    
    return {
      ...baseResponse,
      ...customData
    };
  }
  
  /**
   * Create a custom HTTP response
   * @param {string} type - Response type (success, error, timeout, rateLimit)
   * @param {Object} data - Response data
   * @param {Object} options - Additional options
   * @returns {Object} Custom HTTP response
   */
  static createHttpResponse(type, data, options = {}) {
    if (!mockHttpResponses[type]) {
      throw new Error(`Unknown HTTP response type: ${type}`);
    }
    
    if (type === 'timeout' || type === 'networkError') {
      return mockHttpResponses[type]();
    }
    
    return mockHttpResponses[type](data, options.status);
  }
  
  /**
   * Create a custom database record
   * @param {string} recordType - Record type (providers, models, etc.)
   * @param {Object} customData - Custom data to merge with default record
   * @returns {Object} Custom database record
   */
  static createDatabaseRecord(recordType, customData = {}) {
    if (!mockDatabaseRecords[recordType]) {
      throw new Error(`Unknown record type: ${recordType}`);
    }
    
    const baseRecord = mockDatabaseRecords[recordType][0];
    
    return {
      ...baseRecord,
      ...customData
    };
  }
  
  /**
   * Generate a large dataset with specific characteristics
   * @param {string} dataType - Type of data to generate (models, providers)
   * @param {number} count - Number of items to generate
   * @param {Object} options - Generation options
   * @returns {Array} Generated dataset
   */
  static generateLargeDataset(dataType, count, options = {}) {
    if (!generateLargeDataset[dataType]) {
      throw new Error(`Unknown data type: ${dataType}`);
    }
    
    return generateLargeDataset[dataType](count, options);
  }
}

module.exports = {
  mockProviderResponses,
  mockHttpResponses,
  mockDatabaseRecords,
  generateLargeDataset,
  MockResponseFactory
};