/**
 * Tests for Model Management Utilities
 * 
 * Comprehensive test suite for model formatting, validation, and processing utilities
 * used across all provider adapters in the unified model management system.
 */

const {
  validateStandardModel,
  validatePricingInfo,
  validateModelMetadata,
  normalizeModelSlug,
  normalizeApiModelId,
  createStandardModelName,
  createStandardModelDescription,
  determineMaxTokens,
  extractPricingInfo,
  areModelsEquivalent,
  hasSignificantChanges,
  sanitizeModelData
} = require('../../../services/model-management/utils/model-utils');

describe('Model Utils', () => {
  describe('validateStandardModel', () => {
    const validModel = {
      model_slug: 'test-model-openai',
      api_model_id: 'test-model',
      id_provider: 1,
      name: 'Test Model',
      description: 'A test model for validation',
      max_tokens: 16000,
      is_active: false
    };

    test('should validate a correct model', () => {
      expect(() => validateStandardModel(validModel)).not.toThrow();
    });

    test('should throw error for missing required fields', () => {
      const invalidModel = { ...validModel };
      delete invalidModel.model_slug;
      
      expect(() => validateStandardModel(invalidModel))
        .toThrow("Required field 'model_slug' is missing or null in model object");
    });

    test('should throw error for incorrect field types', () => {
      const invalidModel = { ...validModel, max_tokens: '16000' };
      
      expect(() => validateStandardModel(invalidModel))
        .toThrow("Field 'max_tokens' should be number, got string");
    });

    test('should throw error for empty string fields', () => {
      const invalidModel = { ...validModel, model_slug: '' };
      
      expect(() => validateStandardModel(invalidModel))
        .toThrow('model_slug cannot be empty');
    });

    test('should throw error for invalid numeric values', () => {
      const invalidModel = { ...validModel, max_tokens: -1 };
      
      expect(() => validateStandardModel(invalidModel))
        .toThrow('max_tokens must be greater than 0');
    });

    test('should validate model with pricing info', () => {
      const modelWithPricing = {
        ...validModel,
        pricing: {
          price_1m_input_tokens: 10.0,
          price_1m_output_tokens: 30.0
        }
      };
      
      expect(() => validateStandardModel(modelWithPricing)).not.toThrow();
    });

    test('should validate model with metadata', () => {
      const modelWithMetadata = {
        ...validModel,
        metadata: {
          owned_by: 'openai',
          context_length: 16000,
          model_type: 'chat'
        }
      };
      
      expect(() => validateStandardModel(modelWithMetadata)).not.toThrow();
    });
  });

  describe('validatePricingInfo', () => {
    test('should validate correct pricing info', () => {
      const pricing = {
        price_1m_input_tokens: 10.0,
        price_1m_output_tokens: 30.0,
        score_cost_per_1k_tokens: 0.04
      };
      
      expect(() => validatePricingInfo(pricing)).not.toThrow();
    });

    test('should throw error for missing required fields', () => {
      const pricing = { price_1m_input_tokens: 10.0 };
      
      expect(() => validatePricingInfo(pricing))
        .toThrow("Pricing field 'price_1m_output_tokens' must be a non-negative number");
    });

    test('should throw error for negative prices', () => {
      const pricing = {
        price_1m_input_tokens: -5.0,
        price_1m_output_tokens: 30.0
      };
      
      expect(() => validatePricingInfo(pricing))
        .toThrow("Pricing field 'price_1m_input_tokens' must be a non-negative number");
    });
  });

  describe('validateModelMetadata', () => {
    test('should validate correct metadata', () => {
      const metadata = {
        owned_by: 'openai',
        context_length: 16000,
        model_type: 'chat',
        supported_formats: ['text', 'image']
      };
      
      expect(() => validateModelMetadata(metadata)).not.toThrow();
    });

    test('should throw error for non-object metadata', () => {
      expect(() => validateModelMetadata('not-an-object'))
        .toThrow('metadata must be an object');
    });

    test('should throw error for incorrect field types', () => {
      const metadata = { owned_by: 123 };
      
      expect(() => validateModelMetadata(metadata))
        .toThrow("Metadata field 'owned_by' must be a string if provided");
    });
  });

  describe('normalizeModelSlug', () => {
    test('should normalize slug correctly', () => {
      expect(normalizeModelSlug('GPT-4.0 Turbo!')).toBe('gpt-4-0-turbo');
    });

    test('should handle multiple hyphens', () => {
      expect(normalizeModelSlug('model---name')).toBe('model-name');
    });

    test('should remove leading and trailing hyphens', () => {
      expect(normalizeModelSlug('-model-name-')).toBe('model-name');
    });

    test('should limit length to 100 characters', () => {
      const longSlug = 'a'.repeat(150);
      expect(normalizeModelSlug(longSlug)).toHaveLength(100);
    });

    test('should throw error for non-string input', () => {
      expect(() => normalizeModelSlug(123))
        .toThrow('Model slug must be a string');
    });
  });

  describe('normalizeApiModelId', () => {
    test('should trim whitespace', () => {
      expect(normalizeApiModelId('  model-id  ')).toBe('model-id');
    });

    test('should throw error for non-string input', () => {
      expect(() => normalizeApiModelId(123))
        .toThrow('API model ID must be a string');
    });
  });

  describe('createStandardModelName', () => {
    test('should create name with API model ID', () => {
      const name = createStandardModelName({
        apiModelId: 'gpt-4',
        providerName: 'OpenAI'
      });
      
      expect(name).toBe('gpt-4 (OpenAI)');
    });

    test('should use display name if provided', () => {
      const name = createStandardModelName({
        apiModelId: 'gpt-4',
        providerName: 'OpenAI',
        displayName: 'GPT-4 Turbo'
      });
      
      expect(name).toBe('GPT-4 Turbo (OpenAI)');
    });

    test('should not duplicate provider suffix', () => {
      const name = createStandardModelName({
        apiModelId: 'gpt-4',
        providerName: 'OpenAI',
        displayName: 'GPT-4 (OpenAI)'
      });
      
      expect(name).toBe('GPT-4 (OpenAI)');
    });

    test('should throw error for missing required parameters', () => {
      expect(() => createStandardModelName({ apiModelId: 'gpt-4' }))
        .toThrow('apiModelId and providerName are required');
    });
  });

  describe('createStandardModelDescription', () => {
    test('should use provided description', () => {
      const desc = createStandardModelDescription({
        apiModelId: 'gpt-4',
        providerName: 'OpenAI',
        description: 'Advanced language model'
      });
      
      expect(desc).toBe('Advanced language model');
    });

    test('should generate description from model info', () => {
      const desc = createStandardModelDescription({
        apiModelId: 'gpt-4',
        providerName: 'OpenAI',
        modelType: 'chat'
      });
      
      expect(desc).toBe('OpenAI gpt-4 chat model');
    });

    test('should generate basic description', () => {
      const desc = createStandardModelDescription({
        apiModelId: 'gpt-4',
        providerName: 'OpenAI'
      });
      
      expect(desc).toBe('OpenAI gpt-4 model');
    });
  });

  describe('determineMaxTokens', () => {
    test('should use explicit max tokens', () => {
      const maxTokens = determineMaxTokens({ maxTokens: 32000 });
      expect(maxTokens).toBe(32000);
    });

    test('should use context length', () => {
      const maxTokens = determineMaxTokens({ contextLength: 128000 });
      expect(maxTokens).toBe(128000);
    });

    test('should determine from model ID patterns', () => {
      expect(determineMaxTokens({ apiModelId: 'gpt-4o' })).toBe(128000);
      expect(determineMaxTokens({ apiModelId: 'gpt-4' })).toBe(32000);
      expect(determineMaxTokens({ apiModelId: 'gpt-3.5-turbo-16k' })).toBe(16385);
    });

    test('should use default fallback', () => {
      const maxTokens = determineMaxTokens({ defaultMaxTokens: 8000 });
      expect(maxTokens).toBe(8000);
    });

    test('should use global default', () => {
      const maxTokens = determineMaxTokens({});
      expect(maxTokens).toBe(16000);
    });
  });

  describe('extractPricingInfo', () => {
    test('should extract pricing from raw data', () => {
      const rawPricing = {
        input_price: 10.0,
        output_price: 30.0,
        score_intelligence: 0.9
      };
      
      const pricing = extractPricingInfo(rawPricing);
      
      expect(pricing.price_1m_input_tokens).toBe(10.0);
      expect(pricing.price_1m_output_tokens).toBe(30.0);
      expect(pricing.score_intelligence).toBe(0.9);
    });

    test('should use fallback pricing', () => {
      const fallback = {
        price_1m_input_tokens: 5.0,
        price_1m_output_tokens: 15.0
      };
      
      const pricing = extractPricingInfo(null, fallback);
      
      expect(pricing.price_1m_input_tokens).toBe(5.0);
      expect(pricing.price_1m_output_tokens).toBe(15.0);
    });

    test('should return null for no pricing data', () => {
      const pricing = extractPricingInfo(null);
      expect(pricing).toBeNull();
    });

    test('should return null for zero pricing', () => {
      const rawPricing = { input_price: 0, output_price: 0 };
      const pricing = extractPricingInfo(rawPricing);
      expect(pricing).toBeNull();
    });
  });

  describe('areModelsEquivalent', () => {
    const model1 = {
      api_model_id: 'gpt-4',
      id_provider: 1,
      model_slug: 'gpt-4-openai'
    };

    const model2 = {
      api_model_id: 'gpt-4',
      id_provider: 1,
      model_slug: 'gpt-4-openai'
    };

    test('should return true for equivalent models', () => {
      expect(areModelsEquivalent(model1, model2)).toBe(true);
    });

    test('should return false for different models', () => {
      const differentModel = { ...model2, api_model_id: 'gpt-3.5' };
      expect(areModelsEquivalent(model1, differentModel)).toBe(false);
    });

    test('should return false for null models', () => {
      expect(areModelsEquivalent(model1, null)).toBe(false);
      expect(areModelsEquivalent(null, model2)).toBe(false);
    });
  });

  describe('hasSignificantChanges', () => {
    const existingModel = {
      name: 'GPT-4',
      description: 'Advanced model',
      max_tokens: 8000,
      pricing: {
        price_1m_input_tokens: 10.0,
        price_1m_output_tokens: 30.0
      }
    };

    test('should detect name changes', () => {
      const newModel = { ...existingModel, name: 'GPT-4 Turbo' };
      expect(hasSignificantChanges(existingModel, newModel)).toBe(true);
    });

    test('should detect pricing changes', () => {
      const newModel = {
        ...existingModel,
        pricing: {
          price_1m_input_tokens: 15.0,
          price_1m_output_tokens: 30.0
        }
      };
      expect(hasSignificantChanges(existingModel, newModel)).toBe(true);
    });

    test('should return false for no significant changes', () => {
      const newModel = { ...existingModel };
      expect(hasSignificantChanges(existingModel, newModel)).toBe(false);
    });

    test('should return true for null models', () => {
      expect(hasSignificantChanges(existingModel, null)).toBe(true);
      expect(hasSignificantChanges(null, existingModel)).toBe(true);
    });
  });

  describe('sanitizeModelData', () => {
    test('should trim string fields', () => {
      const model = {
        model_slug: '  test-model  ',
        api_model_id: '  api-id  ',
        name: '  Model Name  ',
        description: '  Model description  ',
        max_tokens: 16000,
        id_provider: 1,
        is_active: false
      };

      const sanitized = sanitizeModelData(model);
      
      expect(sanitized.model_slug).toBe('test-model');
      expect(sanitized.api_model_id).toBe('api-id');
      expect(sanitized.name).toBe('Model Name');
      expect(sanitized.description).toBe('Model description');
    });

    test('should limit field lengths', () => {
      const model = {
        model_slug: 'a'.repeat(150),
        api_model_id: 'b'.repeat(150),
        name: 'c'.repeat(300),
        description: 'd'.repeat(1500),
        max_tokens: 16000,
        id_provider: 1,
        is_active: false
      };

      const sanitized = sanitizeModelData(model);
      
      expect(sanitized.model_slug).toHaveLength(100);
      expect(sanitized.api_model_id).toHaveLength(100);
      expect(sanitized.name).toHaveLength(255);
      expect(sanitized.description).toHaveLength(1000);
    });

    test('should validate numeric fields', () => {
      const model = {
        model_slug: 'test-model',
        api_model_id: 'api-id',
        name: 'Model Name',
        description: 'Model description',
        max_tokens: '16000',
        id_provider: '1',
        is_active: false
      };

      const sanitized = sanitizeModelData(model);
      
      expect(sanitized.max_tokens).toBe(16000);
      expect(sanitized.id_provider).toBe(1);
    });

    test('should throw error for invalid numeric values', () => {
      const model = {
        model_slug: 'test-model',
        api_model_id: 'api-id',
        name: 'Model Name',
        description: 'Model description',
        max_tokens: 'invalid',
        id_provider: 1,
        is_active: false
      };

      expect(() => sanitizeModelData(model))
        .toThrow("Invalid numeric value for field 'max_tokens': invalid");
    });

    test('should ensure boolean fields are proper booleans', () => {
      const model = {
        model_slug: 'test-model',
        api_model_id: 'api-id',
        name: 'Model Name',
        description: 'Model description',
        max_tokens: 16000,
        id_provider: 1,
        is_active: 'true'
      };

      const sanitized = sanitizeModelData(model);
      
      expect(sanitized.is_active).toBe(true);
      expect(typeof sanitized.is_active).toBe('boolean');
    });
  });
});