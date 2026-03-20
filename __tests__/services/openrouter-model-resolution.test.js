/**
 * Tests for OpenRouter model ID resolution logic
 */

const db = require('../../database');
const { Op } = require('sequelize');

// Mock the database models
jest.mock('../../database', () => {
  const mockModel = {
    findOne: jest.fn(),
    getProvider: jest.fn()
  };
  
  const mockAggregatedModel = {
    findOne: jest.fn()
  };
  
  const mockProvider = {
    findOne: jest.fn()
  };
  
  return {
    sequelize: {
      models: {
        Model: mockModel,
        AggregatedModel: mockAggregatedModel,
        Provider: mockProvider
      }
    },
    models: {
      Model: mockModel,
      AggregatedModel: mockAggregatedModel,
      Provider: mockProvider
    },
    initialize: jest.fn(),
    close: jest.fn()
  };
});

// Import the service after mocking the database
const openrouterService = require('../../services/openrouter.service');

describe('OpenRouter Model ID Resolution', () => {
  const { Model, AggregatedModel, Provider } = db.models;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the Provider.findOne to return a provider with ID 1
    Provider.findOne.mockResolvedValue({ id: 1, name: 'openrouter' });
  });
  
  describe('resolveOpenRouterModelId', () => {
    it('should use api_model_id directly when available', async () => {
      // Mock a model with api_model_id
      Model.findOne.mockResolvedValueOnce({
        id: 123,
        model_slug: 'gpt-4-openrouter',
        api_model_id: 'openai/gpt-4',
        tier: null
      });
      
      const result = await openrouterService.resolveOpenRouterModelId('gpt-4-openrouter');
      
      expect(result).toBe('openai/gpt-4');
      expect(Model.findOne).toHaveBeenCalledWith({
        where: {
          [Op.or]: [
            { api_model_id: 'gpt-4-openrouter' },
            { model_slug: 'gpt-4-openrouter' }
          ],
          id_provider: 1,
          is_active: true
        }
      });
    });
    
    it('should use fallback logic when api_model_id is not available', async () => {
      // Mock a model without api_model_id
      const mockModel = {
        id: 123,
        model_slug: 'gpt-4-openrouter',
        api_model_id: null,
        tier: null,
        getProvider: jest.fn().mockResolvedValue({ name: 'openai' })
      };
      
      Model.findOne.mockResolvedValueOnce(mockModel);
      
      // Mock no aggregated model found
      AggregatedModel.findOne.mockResolvedValueOnce(null);
      
      const result = await openrouterService.resolveOpenRouterModelId('gpt-4-openrouter');
      
      // Should use buildOpenRouterModelId as fallback
      expect(result).toBe('openai/gpt-4-openrouter');
      expect(AggregatedModel.findOne).toHaveBeenCalled();
      expect(mockModel.getProvider).toHaveBeenCalled();
    });
    
    it('should use aggregated model data when available', async () => {
      // Mock a model without api_model_id
      Model.findOne.mockResolvedValueOnce({
        id: 123,
        model_slug: 'gpt-4-openrouter',
        api_model_id: null,
        tier: 'free'
      });
      
      // Mock aggregated model found
      AggregatedModel.findOne.mockResolvedValueOnce({
        source_model_id: 'gpt-4',
        sourceProvider: {
          name: 'openai'
        }
      });
      
      const result = await openrouterService.resolveOpenRouterModelId('gpt-4-openrouter');
      
      // Should use aggregated model data
      expect(result).toBe('openai/gpt-4:free');
    });
    
    it('should return original ID when model not found', async () => {
      // Mock no model found
      Model.findOne.mockResolvedValueOnce(null);
      
      const result = await openrouterService.resolveOpenRouterModelId('unknown-model');
      
      // Should return original ID
      expect(result).toBe('unknown-model');
    });
    
    it('should handle numeric model IDs', async () => {
      // Mock a model with api_model_id
      Model.findOne.mockResolvedValueOnce({
        id: 123,
        model_slug: 'gpt-4-openrouter',
        api_model_id: 'openai/gpt-4',
        tier: null
      });
      
      const result = await openrouterService.resolveOpenRouterModelId(123);
      
      expect(result).toBe('openai/gpt-4');
      expect(Model.findOne).toHaveBeenCalledWith({
        where: {
          id: 123,
          id_provider: 1,
          is_active: true
        }
      });
    });
    
    it('should handle errors gracefully', async () => {
      // Mock an error
      Model.findOne.mockRejectedValueOnce(new Error('Database error'));
      
      const result = await openrouterService.resolveOpenRouterModelId('gpt-4-openrouter');
      
      // Should return original ID on error
      expect(result).toBe('gpt-4-openrouter');
    });
  });
  
  describe('isModelAvailable', () => {
    it('should prioritize api_model_id lookup', async () => {
      // Mock a model found by api_model_id
      Model.findOne.mockResolvedValueOnce({
        id: 123,
        model_slug: 'gpt-4-openrouter',
        api_model_id: 'openai/gpt-4'
      });
      
      const result = await openrouterService.isModelAvailable('openai/gpt-4');
      
      expect(result).toBe(true);
      expect(Model.findOne).toHaveBeenCalledWith({
        where: {
          api_model_id: 'openai/gpt-4',
          id_provider: 1,
          is_active: true
        }
      });
      
      // Should not call other lookups
      expect(Model.findOne).toHaveBeenCalledTimes(1);
    });
    
    it('should fall back to ID lookup when api_model_id lookup fails', async () => {
      // Mock api_model_id lookup failure
      Model.findOne.mockResolvedValueOnce(null);
      
      // Mock ID lookup success
      Model.findOne.mockResolvedValueOnce({
        id: 123,
        model_slug: 'gpt-4-openrouter',
        api_model_id: 'openai/gpt-4'
      });
      
      const result = await openrouterService.isModelAvailable(123);
      
      expect(result).toBe(true);
      expect(Model.findOne).toHaveBeenCalledTimes(2);
    });
    
    it('should fall back to model_slug lookup when other lookups fail', async () => {
      // Mock api_model_id lookup failure
      Model.findOne.mockResolvedValueOnce(null);
      
      // For non-numeric modelId, we only do two lookups: api_model_id and model_slug
      // So we need to mock the model_slug lookup next
      Model.findOne.mockResolvedValueOnce({
        id: 123,
        model_slug: 'gpt-4-openrouter',
        api_model_id: 'openai/gpt-4'
      });
      
      const result = await openrouterService.isModelAvailable('gpt-4-openrouter');
      
      expect(result).toBe(true);
      expect(Model.findOne).toHaveBeenCalledTimes(2);
    });
    
    it('should return false when no model is found', async () => {
      // Mock all lookups failing
      // For a string modelId, we need to mock two lookups
      Model.findOne.mockResolvedValueOnce(null); // api_model_id lookup
      Model.findOne.mockResolvedValueOnce(null); // model_slug lookup
      
      const result = await openrouterService.isModelAvailable('unknown-model');
      
      expect(result).toBe(false);
    });
    
    it('should handle errors gracefully', async () => {
      // Mock an error
      Model.findOne.mockRejectedValueOnce(new Error('Database error'));
      
      const result = await openrouterService.isModelAvailable('gpt-4-openrouter');
      
      // Should return false on error
      expect(result).toBe(false);
    });
  });
});