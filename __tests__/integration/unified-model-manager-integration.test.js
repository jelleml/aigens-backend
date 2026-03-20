/**
 * Integration tests for UnifiedModelManager
 * Tests complete workflows from manager to database
 */

const { UnifiedModelManager } = require('../../services/model-management/unified-model-manager');
const { TestDatabaseFactory } = require('../fixtures/database-fixtures');
const { MockResponseFactory } = require('../fixtures/mock-provider-responses');

// Mock HTTP requests
jest.mock('axios');
const axios = require('axios');

describe('UnifiedModelManager Integration Tests', () => {
  let manager;
  let testDbManager;
  let mockLogger;
  let mockMetrics;
  let originalEnv;

  beforeAll(async () => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.TOGETHER_API_KEY = 'test-together-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.IDEOGRAM_API_KEY = 'test-ideogram-key';
    
    // Create test database
    testDbManager = await TestDatabaseFactory.createTestDatabase({
      useRealDatabase: false,
      mockModels: true,
      preloadFixtures: true
    });
  });

  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    if (testDbManager) {
      await testDbManager.cleanup();
    }
  });

  beforeEach(() => {
    // Mock logger and metrics
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn()
    };

    mockMetrics = {
      recordOperationSuccess: jest.fn(),
      recordOperationFailure: jest.fn(),
      recordProcessingTime: jest.fn(),
      recordMemoryUsage: jest.fn()
    };

    // Reset HTTP mocks
    jest.clearAllMocks();
    setupHttpMocks();
    
    // Create manager instance
    manager = new UnifiedModelManager({
      logger: mockLogger,
      metrics: mockMetrics,
      sequelize: testDbManager.sequelize
    });
  });

  afterEach(async () => {
    if (manager) {
      await manager.cleanup();
    }
  });

  describe('Provider Integration', () => {
    it('should initialize all providers successfully', async () => {
      const result = await manager.initialize();
      
      expect(result.success).toBe(true);
      expect(result.initializedProviders.length).toBeGreaterThan(0);
      
      // Verify all providers are initialized
      const expectedProviders = ['openai', 'anthropic', 'together', 'openrouter', 'deepseek', 'ideogram'];
      for (const provider of expectedProviders) {
        expect(manager.providers.has(provider)).toBe(true);
        expect(manager.providers.get(provider).initialized).toBe(true);
      }
    });

    it('should handle provider initialization failures gracefully', async () => {
      // Make OpenAI initialization fail
      axios.get.mockImplementation((url) => {
        if (url.includes('openai.com')) {
          return Promise.reject(new Error('API Error'));
        }
        return Promise.resolve({ data: [] });
      });
      
      const result = await manager.initialize();
      
      expect(result.success).toBe(true); // Overall success despite one failure
      expect(result.failedProviders).toContain('openai');
      
      // OpenAI should be marked as not initialized
      expect(manager.providers.get('openai').initialized).toBe(false);
      expect(manager.providers.get('openai').consecutiveFailures).toBe(1);
    });
  });

  describe('Execution Modes', () => {
    it('should execute in init mode correctly', async () => {
      const result = await manager.execute('init', {
        providers: ['openai'],
        dryRun: true
      });
      
      expect(result.success).toBe(true);
      expect(result.summary.mode).toBe('init');
      expect(result.summary.dryRun).toBe(true);
      expect(result.summary.successfulProviders).toBe(1);
      
      // Verify logger calls
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting model management operation'),
        expect.objectContaining({ mode: 'init' })
      );
    });

    it('should execute in update mode correctly', async () => {
      const result = await manager.execute('update', {
        providers: ['anthropic'],
        dryRun: false
      });
      
      expect(result.success).toBe(true);
      expect(result.summary.mode).toBe('update');
      expect(result.summary.dryRun).toBe(false);
      expect(result.summary.successfulProviders).toBe(1);
      
      // Verify database operations
      expect(testDbManager.sequelize.models.Model.create).toHaveBeenCalled();
      expect(testDbManager.sequelize.models.ModelPriceScore.create).toHaveBeenCalled();
    });

    it('should execute in sync mode correctly', async () => {
      const result = await manager.execute('sync', {
        providers: ['together'],
        dryRun: false
      });
      
      expect(result.success).toBe(true);
      expect(result.summary.mode).toBe('sync');
      expect(result.summary.successfulProviders).toBe(1);
      
      // Verify sync log creation
      expect(testDbManager.sequelize.models.ModelSyncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_name: 'together',
          sync_type: 'sync'
        })
      );
    });
  });

  describe('Provider Selection', () => {
    it('should process all providers when none specified', async () => {
      const result = await manager.execute('update', {
        dryRun: true
      });
      
      expect(result.success).toBe(true);
      expect(result.summary.totalProviders).toBeGreaterThan(1);
      
      // All providers should be processed
      const expectedProviders = ['openai', 'anthropic', 'together', 'openrouter', 'deepseek', 'ideogram'];
      for (const provider of expectedProviders) {
        expect(result.providerResults).toHaveProperty(provider);
      }
    });

    it('should process only specified providers', async () => {
      const result = await manager.execute('update', {
        providers: ['openai', 'anthropic'],
        dryRun: true
      });
      
      expect(result.success).toBe(true);
      expect(result.summary.totalProviders).toBe(2);
      
      // Only specified providers should be processed
      expect(result.providerResults).toHaveProperty('openai');
      expect(result.providerResults).toHaveProperty('anthropic');
      expect(result.providerResults).not.toHaveProperty('together');
    });

    it('should skip disabled providers', async () => {
      // Disable OpenAI provider
      manager.providers.get('openai').config.enabled = false;
      
      const result = await manager.execute('update', {
        providers: ['openai', 'anthropic'],
        dryRun: true
      });
      
      expect(result.success).toBe(true);
      expect(result.summary.totalProviders).toBe(2);
      expect(result.summary.skippedProviders).toBe(1);
      
      // OpenAI should be skipped
      expect(result.providerResults.openai.status).toBe('skipped');
      expect(result.providerResults.anthropic.status).toBe('success');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      // Make OpenAI API fail
      axios.get.mockImplementation((url) => {
        if (url.includes('openai.com')) {
          return Promise.reject(new Error('API Error'));
        }
        return Promise.resolve({ data: [] });
      });
      
      const result = await manager.execute('update', {
        providers: ['openai'],
        dryRun: true
      });
      
      expect(result.success).toBe(true); // Overall success despite provider failure
      expect(result.summary.failedProviders).toBe(1);
      expect(result.providerResults.openai.status).toBe('failed');
      expect(result.providerResults.openai.error).toContain('API Error');
    });

    it('should handle rate limiting with retry', async () => {
      // Mock rate limit then success
      let callCount = 0;
      axios.get.mockImplementation((url) => {
        if (url.includes('openai.com')) {
          callCount++;
          if (callCount === 1) {
            // First call fails with rate limit
            const error = new Error('Rate limit exceeded');
            error.response = {
              status: 429,
              data: { error: 'Rate limit exceeded' },
              headers: { 'retry-after': '1' }
            };
            return Promise.reject(error);
          }
          // Second call succeeds
          return Promise.resolve({ 
            data: MockResponseFactory.createProviderResponse('openai', 'success')
          });
        }
        return Promise.resolve({ data: [] });
      });
      
      const result = await manager.execute('update', {
        providers: ['openai'],
        dryRun: true
      });
      
      expect(result.success).toBe(true);
      expect(result.summary.successfulProviders).toBe(1);
      expect(callCount).toBe(2); // Verify retry happened
    });

    it('should handle database errors gracefully', async () => {
      // Make database operation fail
      testDbManager.sequelize.models.Model.create.mockRejectedValue(
        new Error('Database error')
      );
      
      const result = await manager.execute('update', {
        providers: ['openai'],
        dryRun: false
      });
      
      expect(result.success).toBe(true); // Overall success despite provider failure
      expect(result.summary.failedProviders).toBe(1);
      expect(result.providerResults.openai.status).toBe('failed');
      expect(result.providerResults.openai.error).toContain('Database error');
    });
  });

  describe('Health Checks', () => {
    it('should perform health checks for providers', async () => {
      const healthResults = await manager.checkProvidersHealth();
      
      expect(healthResults).toHaveProperty('openai');
      expect(healthResults).toHaveProperty('anthropic');
      
      // Verify health status is updated in database
      expect(testDbManager.sequelize.models.ProviderHealthStatus.upsert).toHaveBeenCalled();
    });

    it('should handle health check failures gracefully', async () => {
      // Make OpenAI health check fail
      axios.get.mockImplementation((url) => {
        if (url.includes('openai.com')) {
          return Promise.reject(new Error('Health check failed'));
        }
        return Promise.resolve({ data: [] });
      });
      
      const healthResults = await manager.checkProvidersHealth();
      
      expect(healthResults.openai.status).toBe('unhealthy');
      expect(healthResults.openai.error).toContain('Health check failed');
      
      // Verify health status is updated in database
      expect(testDbManager.sequelize.models.ProviderHealthStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_name: 'openai',
          status: 'unhealthy'
        })
      );
    });
  });

  // Helper functions
  function setupHttpMocks() {
    // Default successful responses for all providers
    axios.get.mockImplementation((url) => {
      if (url.includes('openai.com')) {
        return Promise.resolve({ 
          data: MockResponseFactory.createProviderResponse('openai', 'success')
        });
      } else if (url.includes('anthropic.com')) {
        return Promise.resolve({ 
          data: MockResponseFactory.createProviderResponse('anthropic', 'success')
        });
      } else if (url.includes('together.xyz')) {
        return Promise.resolve({ 
          data: MockResponseFactory.createProviderResponse('together', 'success')
        });
      } else if (url.includes('openrouter.ai')) {
        return Promise.resolve({ 
          data: MockResponseFactory.createProviderResponse('openrouter', 'success')
        });
      } else if (url.includes('deepseek.com')) {
        return Promise.resolve({ 
          data: MockResponseFactory.createProviderResponse('deepseek', 'success')
        });
      } else if (url.includes('ideogram.ai')) {
        return Promise.resolve({ 
          data: MockResponseFactory.createProviderResponse('ideogram', 'success')
        });
      }
      
      return Promise.reject(new Error('Unknown API endpoint'));
    });
  }
});