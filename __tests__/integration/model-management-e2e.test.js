/**
 * End-to-end integration tests for model management system
 * Tests complete workflows from CLI to database
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { TestDatabaseManager } = require('../fixtures/database-fixtures');
const { mockProviderResponses, mockHttpResponses } = require('../fixtures/mock-provider-responses');

// Mock HTTP requests for integration tests
jest.mock('axios');
const axios = require('axios');

describe('Model Management E2E Integration Tests', () => {
  let testDbManager;
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

    // Mock database for integration tests
    const mockSequelize = {
      models: {
        Provider: {
          findOne: jest.fn(),
          create: jest.fn(),
          destroy: jest.fn(),
          count: jest.fn()
        },
        Model: {
          findOne: jest.fn(),
          findAll: jest.fn(),
          create: jest.fn(),
          destroy: jest.fn(),
          count: jest.fn()
        },
        ModelPriceScore: {
          create: jest.fn(),
          destroy: jest.fn(),
          count: jest.fn()
        },
        ModelSyncLog: {
          create: jest.fn(),
          findAll: jest.fn(),
          count: jest.fn()
        },
        ProviderHealthStatus: {
          create: jest.fn(),
          findOne: jest.fn(),
          upsert: jest.fn(),
          count: jest.fn()
        }
      },
      transaction: jest.fn(),
      authenticate: jest.fn().mockResolvedValue(),
      sync: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue()
    };

    testDbManager = new TestDatabaseManager(mockSequelize);
    await testDbManager.setup();
  });

  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    if (testDbManager) {
      await testDbManager.cleanup();
    }
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default HTTP mocks
    setupHttpMocks();
  });

  describe('CLI Integration', () => {
    it('should execute sync command successfully', async () => {
      const result = await runCLICommand(['sync', '--providers', 'openai', '--dry-run']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Sync completed successfully');
      expect(result.stdout).toContain('openai');
      expect(result.stdout).toContain('DRY RUN');
    });

    it('should execute health check command', async () => {
      const result = await runCLICommand(['health']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Provider Health Status');
      expect(result.stdout).toMatch(/openai.*healthy|degraded|unhealthy/);
    });

    it('should execute status command', async () => {
      const result = await runCLICommand(['status']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Model Management System Status');
      expect(result.stdout).toContain('Total Providers');
    });

    it('should handle invalid commands gracefully', async () => {
      const result = await runCLICommand(['invalid-command']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command');
    });

    it('should show help when requested', async () => {
      const result = await runCLICommand(['--help']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('sync');
      expect(result.stdout).toContain('health');
    });
  });

  describe('Provider Integration Workflows', () => {
    it('should complete full OpenAI sync workflow', async () => {
      // Setup OpenAI mock responses
      axios.get.mockResolvedValueOnce(
        mockHttpResponses.success(mockProviderResponses.openai.success)
      );

      // Setup database mocks
      setupDatabaseMocksForProvider('openai', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('openai: SUCCESS');
      expect(result.stdout).toContain('Models processed: 3');
    });

    it('should complete full Anthropic sync workflow', async () => {
      axios.get.mockResolvedValueOnce(
        mockHttpResponses.success(mockProviderResponses.anthropic.success)
      );

      setupDatabaseMocksForProvider('anthropic', 3);

      const result = await runCLICommand(['sync', '--providers', 'anthropic']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('anthropic: SUCCESS');
      expect(result.stdout).toContain('Models processed: 3');
    });

    it('should handle provider failures gracefully', async () => {
      // Mock API failure
      axios.get.mockRejectedValueOnce(new Error('API Error'));

      const result = await runCLICommand(['sync', '--providers', 'openai']);
      
      expect(result.exitCode).toBe(0); // Should not fail completely
      expect(result.stdout).toContain('openai: FAILED');
      expect(result.stdout).toContain('API Error');
    });

    it('should sync multiple providers sequentially', async () => {
      // Setup mocks for multiple providers
      axios.get
        .mockResolvedValueOnce(mockHttpResponses.success(mockProviderResponses.openai.success))
        .mockResolvedValueOnce(mockHttpResponses.success(mockProviderResponses.anthropic.success));

      setupDatabaseMocksForProvider('openai', 3);
      setupDatabaseMocksForProvider('anthropic', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai,anthropic']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('openai: SUCCESS');
      expect(result.stdout).toContain('anthropic: SUCCESS');
      expect(result.stdout).toContain('Total models processed: 6');
    });
  });

  describe('Database Integration', () => {
    it('should create models and pricing data correctly', async () => {
      axios.get.mockResolvedValueOnce(
        mockHttpResponses.success(mockProviderResponses.openai.success)
      );

      const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
      testDbManager.sequelize.transaction.mockImplementation((callback) => 
        callback(mockTransaction)
      );

      // Track database operations
      const createdModels = [];
      const createdPricing = [];

      testDbManager.sequelize.models.Model.create.mockImplementation((data) => {
        const model = { id: createdModels.length + 1, ...data };
        createdModels.push(model);
        return Promise.resolve(model);
      });

      testDbManager.sequelize.models.ModelPriceScore.create.mockImplementation((data) => {
        const pricing = { id: createdPricing.length + 1, ...data };
        createdPricing.push(pricing);
        return Promise.resolve(pricing);
      });

      setupDatabaseMocksForProvider('openai', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai']);
      
      expect(result.exitCode).toBe(0);
      expect(createdModels).toHaveLength(3);
      expect(createdPricing).toHaveLength(3);
      
      // Verify model data structure
      createdModels.forEach(model => {
        expect(model).toHaveProperty('model_slug');
        expect(model).toHaveProperty('api_model_id');
        expect(model).toHaveProperty('name');
        expect(model.id_provider).toBe(1); // OpenAI provider ID
      });

      // Verify pricing data
      createdPricing.forEach(pricing => {
        expect(pricing).toHaveProperty('id_model');
        expect(pricing).toHaveProperty('price_1m_input_tokens');
        expect(pricing).toHaveProperty('price_1m_output_tokens');
      });
    });

    it('should handle database transaction rollback on errors', async () => {
      axios.get.mockResolvedValueOnce(
        mockHttpResponses.success(mockProviderResponses.openai.success)
      );

      const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
      testDbManager.sequelize.transaction.mockImplementation((callback) => 
        callback(mockTransaction)
      );

      // Make model creation fail
      testDbManager.sequelize.models.Model.create.mockRejectedValueOnce(
        new Error('Database error')
      );

      setupDatabaseMocksForProvider('openai', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai']);
      
      expect(result.exitCode).toBe(0); // Should handle error gracefully
      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(result.stdout).toContain('Database error');
    });

    it('should update existing models correctly', async () => {
      axios.get.mockResolvedValueOnce(
        mockHttpResponses.success(mockProviderResponses.openai.success)
      );

      // Mock existing model
      const existingModel = {
        id: 1,
        model_slug: 'gpt-4-openai',
        update: jest.fn().mockResolvedValue()
      };

      testDbManager.sequelize.models.Model.findOne.mockResolvedValue(existingModel);
      setupDatabaseMocksForProvider('openai', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai', '--mode', 'update']);
      
      expect(result.exitCode).toBe(0);
      expect(existingModel.update).toHaveBeenCalled();
      expect(result.stdout).toContain('Models updated: 3');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network timeouts gracefully', async () => {
      // Mock timeout error
      const timeoutError = new Error('timeout of 30000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      axios.get.mockRejectedValueOnce(timeoutError);

      const result = await runCLICommand(['sync', '--providers', 'openai']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('timeout');
      expect(result.stdout).toContain('openai: FAILED');
    });

    it('should handle rate limiting with retry', async () => {
      // Mock rate limit then success
      axios.get
        .mockRejectedValueOnce({
          response: mockHttpResponses.rateLimit(mockProviderResponses.openai.rateLimit)
        })
        .mockResolvedValueOnce(
          mockHttpResponses.success(mockProviderResponses.openai.success)
        );

      setupDatabaseMocksForProvider('openai', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rate limit');
      expect(result.stdout).toContain('openai: SUCCESS'); // Should succeed after retry
    });

    it('should handle authentication errors', async () => {
      axios.get.mockRejectedValueOnce({
        response: mockHttpResponses.error(mockProviderResponses.openai.error, 401)
      });

      const result = await runCLICommand(['sync', '--providers', 'openai']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Invalid API key');
      expect(result.stdout).toContain('openai: FAILED');
    });

    it('should continue processing other providers when one fails', async () => {
      // OpenAI fails, Anthropic succeeds
      axios.get
        .mockRejectedValueOnce(new Error('OpenAI API Error'))
        .mockResolvedValueOnce(
          mockHttpResponses.success(mockProviderResponses.anthropic.success)
        );

      setupDatabaseMocksForProvider('anthropic', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai,anthropic']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('openai: FAILED');
      expect(result.stdout).toContain('anthropic: SUCCESS');
      expect(result.stdout).toContain('Successful providers: 1');
      expect(result.stdout).toContain('Failed providers: 1');
    });
  });

  describe('Configuration and Environment', () => {
    it('should respect configuration overrides', async () => {
      // Create temporary config file
      const configPath = path.join(__dirname, '../temp-config.json');
      const testConfig = {
        providers: {
          openai: {
            enabled: true,
            timeout: 5000,
            batchSize: 10
          }
        }
      };

      await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));

      try {
        const result = await runCLICommand(['sync', '--config', configPath, '--dry-run']);
        
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Configuration loaded');
      } finally {
        // Clean up temp file
        try {
          await fs.unlink(configPath);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    it('should handle missing API keys gracefully', async () => {
      // Temporarily remove API key
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const result = await runCLICommand(['sync', '--providers', 'openai']);
        
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('No API key found');
        expect(result.stdout).toContain('openai: SKIPPED');
      } finally {
        // Restore API key
        process.env.OPENAI_API_KEY = originalKey;
      }
    });
  });

  describe('Logging and Monitoring', () => {
    it('should generate comprehensive logs', async () => {
      axios.get.mockResolvedValueOnce(
        mockHttpResponses.success(mockProviderResponses.openai.success)
      );

      setupDatabaseMocksForProvider('openai', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai', '--verbose']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Starting sync operation');
      expect(result.stdout).toContain('Fetching models from openai');
      expect(result.stdout).toContain('Processing batch');
      expect(result.stdout).toContain('Sync completed successfully');
    });

    it('should create sync logs in database', async () => {
      axios.get.mockResolvedValueOnce(
        mockHttpResponses.success(mockProviderResponses.openai.success)
      );

      const createdLogs = [];
      testDbManager.sequelize.models.ModelSyncLog.create.mockImplementation((data) => {
        const log = { id: createdLogs.length + 1, ...data };
        createdLogs.push(log);
        return Promise.resolve(log);
      });

      setupDatabaseMocksForProvider('openai', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai']);
      
      expect(result.exitCode).toBe(0);
      expect(createdLogs).toHaveLength(1);
      
      const syncLog = createdLogs[0];
      expect(syncLog.provider_name).toBe('openai');
      expect(syncLog.sync_type).toBe('sync');
      expect(syncLog.status).toBe('completed');
      expect(syncLog.models_processed).toBe(3);
    });

    it('should update provider health status', async () => {
      axios.get.mockResolvedValueOnce(
        mockHttpResponses.success(mockProviderResponses.openai.success)
      );

      const healthUpdates = [];
      testDbManager.sequelize.models.ProviderHealthStatus.upsert.mockImplementation((data) => {
        healthUpdates.push(data);
        return Promise.resolve([{ ...data }, true]);
      });

      setupDatabaseMocksForProvider('openai', 3);

      const result = await runCLICommand(['sync', '--providers', 'openai']);
      
      expect(result.exitCode).toBe(0);
      expect(healthUpdates).toHaveLength(1);
      
      const healthUpdate = healthUpdates[0];
      expect(healthUpdate.provider_name).toBe('openai');
      expect(healthUpdate.status).toBe('healthy');
      expect(healthUpdate.consecutive_failures).toBe(0);
    });
  });

  // Helper functions
  function setupHttpMocks() {
    // Default successful responses for all providers
    axios.get.mockImplementation((url) => {
      if (url.includes('openai.com')) {
        return Promise.resolve(mockHttpResponses.success(mockProviderResponses.openai.success));
      } else if (url.includes('anthropic.com')) {
        return Promise.resolve(mockHttpResponses.success(mockProviderResponses.anthropic.success));
      } else if (url.includes('together.xyz')) {
        return Promise.resolve(mockHttpResponses.success(mockProviderResponses.together.success));
      } else if (url.includes('openrouter.ai')) {
        return Promise.resolve(mockHttpResponses.success(mockProviderResponses.openrouter.success));
      } else if (url.includes('deepseek.com')) {
        return Promise.resolve(mockHttpResponses.success(mockProviderResponses.deepseek.success));
      } else if (url.includes('ideogram.ai')) {
        return Promise.resolve(mockHttpResponses.success(mockProviderResponses.ideogram.success));
      }
      
      return Promise.reject(new Error('Unknown API endpoint'));
    });
  }

  function setupDatabaseMocksForProvider(providerName, modelCount) {
    testDbManager.sequelize.models.Provider.findOne.mockResolvedValue({
      id: getProviderIdByName(providerName),
      name: providerName
    });

    testDbManager.sequelize.models.Model.findOne.mockResolvedValue(null);
    testDbManager.sequelize.models.Model.create.mockResolvedValue({ id: 1 });
    testDbManager.sequelize.models.ModelPriceScore.create.mockResolvedValue({ id: 1 });

    const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
    testDbManager.sequelize.transaction.mockImplementation((callback) => 
      callback(mockTransaction)
    );
  }

  function getProviderIdByName(name) {
    const providerIds = {
      openai: 1,
      anthropic: 2,
      together: 3,
      openrouter: 4,
      deepseek: 5,
      ideogram: 6
    };
    return providerIds[name] || 1;
  }

  async function runCLICommand(args, options = {}) {
    return new Promise((resolve) => {
      const cliPath = path.join(__dirname, '../../services/model-management/cli/index.js');
      const child = spawn('node', [cliPath, ...args], {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' },
        ...options
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      // Set timeout to prevent hanging tests
      setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: 'Test timeout'
        });
      }, 30000); // 30 second timeout
    });
  }
});

module.exports = {
  runCLICommand: async (args, options = {}) => {
    // Export for use in other test files
    const cliPath = path.join(__dirname, '../../services/model-management/cli/index.js');
    return new Promise((resolve) => {
      const child = spawn('node', [cliPath, ...args], {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' },
        ...options
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: 'Test timeout'
        });
      }, 30000);
    });
  }
};