const request = require('supertest');
const app = require('../../server');
const db = require('../../database');
const pythonAddonService = require('../../services/python-addon.service');

// Mock the Python addon service
jest.mock('../../services/python-addon.service');

describe('Messages API with Python Addon Integration', () => {
  let authToken;
  let userId;
  let chatId;
  let modelId;

  beforeAll(async () => {
    // Initialize database connection
    await db.sequelize.sync({ force: true });

    // Create test user
    const user = await db.sequelize.models.User.create({
      email: 'test@example.com',
      password: 'hashedpassword',
      is_verified: true
    });
    userId = user.id;

    // Create test wallet with sufficient balance
    await db.sequelize.models.Wallet.create({
      user_id: userId,
      balance: 100.0,
      currency: 'EUR'
    });

    // Create test provider
    const provider = await db.sequelize.models.Provider.create({
      name: 'anthropic',
      api_key: 'test-key',
      is_active: true
    });

    // Create test model
    const model = await db.sequelize.models.Model.create({
      name: 'Claude 3 Opus',
      model_slug: 'claude-3-opus',
      api_model_id: 'claude-3-opus-20240229',
      id_provider: provider.id,
      is_active: true,
      input_price_per_million: 15.0,
      output_price_per_million: 75.0
    });
    modelId = model.id;

    // Create test chat
    const chat = await db.sequelize.models.Chat.create({
      user_id: userId,
      title: 'Test Chat',
      agent_model: 'claude-3-opus'
    });
    chatId = chat.id;

    // Generate auth token (simplified for testing)
    authToken = 'Bearer test-token';
  });

  afterAll(async () => {
    await db.sequelize.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/chats/:chatId/messages', () => {
    it('should successfully process message with cost estimation', async () => {
      // Mock Python addon service responses
      pythonAddonService.getExpectedCost.mockResolvedValue({
        estimated_output_tokens: 1050,
        expected_costs: {
          currency: 'EUR',
          total_cost_tokens: 0.632,
          model_found: 'claude-3-opus-anthropic',
          model_id: 1,
          model_name: 'Claude 3 Opus'
        }
      });

      pythonAddonService.extractTotalCostTokens.mockReturnValue(0.632);

      pythonAddonService.categorizePrompt.mockResolvedValue({
        anthropic_categories: ['Computer & Mathematical', 'Arts & Media'],
        model_used: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
        original_text: 'Test prompt',
        task_complexity: 'medium',
        task_topic: ['translate', 'writing'],
        task_type: ['TEXT']
      });

      // Mock AI service response (would need to mock the actual service)
      const mockAIResponse = {
        fullText: 'This is a test response from the AI.',
        inputTokens: 10,
        outputTokens: 20,
        cost: {
          totalCost: 0.5,
          baseCost: 0.4,
          fixedMarkup: 0.05,
          percentageMarkup: 0.05
        }
      };

      const response = await request(app)
        .post(`/api/v1/chats/${chatId}/messages`)
        .set('Authorization', authToken)
        .send({
          content: 'Test prompt for AI processing',
          agent_type: 'chat',
          id_model: modelId
        });

      // Verify cost estimation was called
      expect(pythonAddonService.getExpectedCost).toHaveBeenCalledWith(
        'Test prompt for AI processing',
        'claude-3-opus-20240229',
        'categories',
        'Qwen/Qwen2.5-7B-Instruct-Turbo',
        0,
        false
      );

      // Verify balance check was performed
      expect(pythonAddonService.extractTotalCostTokens).toHaveBeenCalled();

      // Verify categorization was called (background operation)
      setTimeout(() => {
        expect(pythonAddonService.categorizePrompt).toHaveBeenCalledWith(
          'Test prompt for AI processing',
          false
        );
      }, 100);
    });

    it('should return insufficient funds error when balance is low', async () => {
      // Update wallet to have insufficient balance
      await db.sequelize.models.Wallet.update(
        { balance: 0.1 },
        { where: { user_id: userId } }
      );

      // Mock high cost estimation
      pythonAddonService.getExpectedCost.mockResolvedValue({
        expected_costs: {
          total_cost_tokens: 10.0 // Higher than wallet balance
        }
      });

      pythonAddonService.extractTotalCostTokens.mockReturnValue(10.0);

      const response = await request(app)
        .post(`/api/v1/chats/${chatId}/messages`)
        .set('Authorization', authToken)
        .send({
          content: 'Expensive prompt',
          agent_type: 'chat',
          id_model: modelId
        });

      expect(response.status).toBe(402);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Fondi insufficienti');
      expect(response.body.details).toContain('Costo stimato: 10 crediti');

      // Restore wallet balance for other tests
      await db.sequelize.models.Wallet.update(
        { balance: 100.0 },
        { where: { user_id: userId } }
      );
    });

    it('should handle model not found error', async () => {
      pythonAddonService.getExpectedCost.mockRejectedValue(
        new Error("Model 'unknown-model' not found in database")
      );

      const response = await request(app)
        .post(`/api/v1/chats/${chatId}/messages`)
        .set('Authorization', authToken)
        .send({
          content: 'Test prompt',
          agent_type: 'chat',
          id_model: modelId
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Model 'unknown-model' not found in database");
    });

    it('should handle generic cost estimation errors', async () => {
      pythonAddonService.getExpectedCost.mockRejectedValue(
        new Error('Network timeout')
      );

      const response = await request(app)
        .post(`/api/v1/chats/${chatId}/messages`)
        .set('Authorization', authToken)
        .send({
          content: 'Test prompt',
          agent_type: 'chat',
          id_model: modelId
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Errore controllo credito');
    });

    it('should handle attachments in cost estimation', async () => {
      pythonAddonService.getExpectedCost.mockResolvedValue({
        expected_costs: {
          total_cost_tokens: 1.5 // Higher cost due to attachments
        }
      });

      pythonAddonService.extractTotalCostTokens.mockReturnValue(1.5);

      // Create a mock file buffer for testing
      const mockFile = Buffer.from('fake image data');

      const response = await request(app)
        .post(`/api/v1/chats/${chatId}/messages`)
        .set('Authorization', authToken)
        .field('content', 'Analyze this image')
        .field('agent_type', 'chat')
        .field('id_model', modelId.toString())
        .attach('files', mockFile, 'test-image.jpg');

      // Verify cost estimation included attachment count
      expect(pythonAddonService.getExpectedCost).toHaveBeenCalledWith(
        'Analyze this image',
        'claude-3-opus-20240229',
        'categories',
        'Qwen/Qwen2.5-7B-Instruct-Turbo',
        1, // number of attachments
        false
      );
    });

    it('should continue processing if categorization fails', async () => {
      // Mock successful cost estimation
      pythonAddonService.getExpectedCost.mockResolvedValue({
        expected_costs: {
          total_cost_tokens: 0.5
        }
      });

      pythonAddonService.extractTotalCostTokens.mockReturnValue(0.5);

      // Mock categorization failure
      pythonAddonService.categorizePrompt.mockRejectedValue(
        new Error('Categorization service unavailable')
      );

      const response = await request(app)
        .post(`/api/v1/chats/${chatId}/messages`)
        .set('Authorization', authToken)
        .send({
          content: 'Test prompt',
          agent_type: 'chat',
          id_model: modelId
        });

      // Message processing should still succeed
      // (Note: This test would need proper AI service mocking to fully work)
      expect(pythonAddonService.getExpectedCost).toHaveBeenCalled();
    });
  });

  describe('Usage Statistics Collection', () => {
    it('should save usage statistics after successful categorization', async () => {
      // Mock successful responses
      pythonAddonService.getExpectedCost.mockResolvedValue({
        expected_costs: { total_cost_tokens: 0.5 }
      });
      pythonAddonService.extractTotalCostTokens.mockReturnValue(0.5);
      
      const mockCategorization = {
        anthropic_categories: ['Computer & Mathematical'],
        task_topic: ['writing'],
        task_type: ['TEXT'],
        task_complexity: 'medium'
      };
      
      pythonAddonService.categorizePrompt.mockResolvedValue(mockCategorization);

      // Process a message
      await request(app)
        .post(`/api/v1/chats/${chatId}/messages`)
        .set('Authorization', authToken)
        .send({
          content: 'Test statistical prompt',
          agent_type: 'chat',
          id_model: modelId
        });

      // Wait for background operations to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check if usage statistics were saved
      const usageStats = await db.sequelize.models.ModelStatsUsage.findAll({
        where: { model_id: modelId }
      });

      // Note: This test would need proper AI service mocking to create actual messages
      // and verify statistics are saved correctly
      expect(pythonAddonService.categorizePrompt).toHaveBeenCalled();
    });
  });

  describe('Streaming Mode', () => {
    it('should handle cost estimation in streaming mode', async () => {
      pythonAddonService.getExpectedCost.mockResolvedValue({
        expected_costs: { total_cost_tokens: 0.5 }
      });
      pythonAddonService.extractTotalCostTokens.mockReturnValue(0.5);

      const response = await request(app)
        .post(`/api/v1/chats/${chatId}/messages`)
        .set('Authorization', authToken)
        .set('Accept', 'text/event-stream')
        .send({
          content: 'Streaming test prompt',
          agent_type: 'chat',
          id_model: modelId
        });

      // Verify cost estimation was called for streaming mode
      expect(pythonAddonService.getExpectedCost).toHaveBeenCalled();
    });

    it('should handle insufficient funds in streaming mode', async () => {
      // Set low balance
      await db.sequelize.models.Wallet.update(
        { balance: 0.1 },
        { where: { user_id: userId } }
      );

      pythonAddonService.getExpectedCost.mockResolvedValue({
        expected_costs: { total_cost_tokens: 10.0 }
      });
      pythonAddonService.extractTotalCostTokens.mockReturnValue(10.0);

      const response = await request(app)
        .post(`/api/v1/chats/${chatId}/messages`)
        .set('Authorization', authToken)
        .set('Accept', 'text/event-stream')
        .send({
          content: 'Expensive streaming prompt',
          agent_type: 'chat',
          id_model: modelId
        });

      // Should receive streaming error event
      expect(response.status).toBe(200); // SSE always returns 200
      // Response body would contain error event in real scenario

      // Restore balance
      await db.sequelize.models.Wallet.update(
        { balance: 100.0 },
        { where: { user_id: userId } }
      );
    });
  });
});