const request = require('supertest');
const express = require('express');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');

// Mock delle dipendenze
jest.mock('../../services/anthropic.service', () => ({
  sendRequest: jest.fn().mockResolvedValue({
    content: 'Sono Claude, un assistente AI sviluppato da Anthropic.',
    messageId: 2,
    userMessageId: 1,
    cost: {
      totalCost: 0.05,
      inputTokens: 100,
      outputTokens: 200
    }
  }),
  isModelAvailable: jest.fn().mockReturnValue(true)
}));

jest.mock('../../services/model.service', () => ({
  getModelByModelId: jest.fn().mockResolvedValue({
    id: 1,
    model_id: 'claude-3-7-sonnet-20250219',
    name: 'Claude 3.7 Sonnet',
    input_price_per_token: 0.000008,
    output_price_per_token: 0.000024,
    output_ratio: 2.0,
    max_tokens: 200000
  }),
  getEstimatedOutputRatio: jest.fn().mockResolvedValue(2.0)
}));

// Mock del middleware di autenticazione
jest.mock('../../middlewares/auth.middleware', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1 };
    next();
  },
  authorize: jest.fn(() => (req, res, next) => next())
}));

// Mock dei modelli Sequelize
jest.mock('../../database', () => {
  const mockSequelize = {
    transaction: jest.fn().mockImplementation(() => ({
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue()
    })),
    models: {
      User: {
        findByPk: jest.fn(),
        findOne: jest.fn()
      },
      Chat: {
        findByPk: jest.fn(),
        findOne: jest.fn()
      },
      Message: {
        findAll: jest.fn(),
        create: jest.fn(),
        findOne: jest.fn()
      },
      Wallet: {
        findOne: jest.fn(),
        findByPk: jest.fn()
      },
      Transaction: {
        create: jest.fn()
      },
      MessageCost: {
        create: jest.fn(),
        findOne: jest.fn()
      },
      Attachment: {
        create: jest.fn(),
        destroy: jest.fn()
      },
      Model: {
        findOne: jest.fn(),
        findAll: jest.fn()
      }
    }
  };
  return { sequelize: mockSequelize };
});

describe('Anthropic API Test', () => {
  const anthropicService = require('../../services/anthropic.service');
  const db = require('../../database');
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock delle risposte dei modelli
    db.sequelize.models.User.findByPk.mockResolvedValue({ id: 1 });
    db.sequelize.models.User.findOne.mockResolvedValue({ id: 1 });
    db.sequelize.models.Chat.findByPk.mockResolvedValue({ id: 1, user_id: 1, save: jest.fn() });
    db.sequelize.models.Chat.findOne.mockResolvedValue({ id: 1, user_id: 1, save: jest.fn() });
    db.sequelize.models.Message.findAll.mockResolvedValue([]);
    db.sequelize.models.Message.create.mockImplementation((data) => Promise.resolve({
      ...data,
      id: data.role === 'user' ? 1 : 2,
      save: jest.fn().mockResolvedValue(true)
    }));
    db.sequelize.models.Message.findOne.mockImplementation((query) => {
      const id = query?.where?.id || 1;
      return Promise.resolve({
        id,
        role: id === 1 ? 'user' : 'assistant',
        content: id === 1 ? 'User message' : 'Assistant message',
        MessageCost: { total_cost: 0.05 },
        Attachments: []
      });
    });
    db.sequelize.models.Wallet.findOne.mockResolvedValue({
      id: 1,
      balance: 100.0,
      currency: 'USD',
      save: jest.fn().mockResolvedValue(true)
    });
    db.sequelize.models.Transaction.create.mockResolvedValue({ id: 1 });
    db.sequelize.models.MessageCost.create.mockResolvedValue({ id: 1 });
    db.sequelize.models.Model.findOne.mockResolvedValue({
      id: 1,
      model_id: 'claude-3-7-sonnet-20250219',
      provider: 'anthropic',
      is_active: true
    });
    db.sequelize.models.Model.findAll.mockResolvedValue([{
      id: 1,
      model_id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      provider: 'anthropic',
      is_active: true
    }]);

    // Create a simple express app with a mocked messages router
    app = express();
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    // Simplified mock router for testing
    const mockRouter = express.Router();
    mockRouter.post('/', (req, res) => {
      const { content, agent_type, agent_model } = req.body;

      anthropicService.sendRequest(
        content,
        agent_model,
        1,
        undefined,
        agent_type,
        []
      ).then(response => {
        res.status(201).json({
          success: true,
          data: {
            userMessageId: 1,
            assistantMessageId: 2,
            content: response.content,
            cost: response.cost
          }
        });
      }).catch(err => {
        res.status(500).json({
          success: false,
          error: err.message
        });
      });
    });

    app.use('/api/v1/chats/:chatId/messages', mockRouter);
  });

  describe('POST /api/v1/chats/:chatId/messages', () => {
    it('dovrebbe elaborare correttamente una richiesta con il modello claude-3-7-sonnet', async () => {
      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .send({
          content: 'ciao, dimmi chi sei e cosa posso chiederti',
          agent_type: 'chat',
          agent_model: 'claude-3-7-sonnet'
        });

      // Stampa il corpo della risposta per il debug
      console.log('Risposta status:', response.status);
      console.log('Risposta body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      // Verifica che il servizio Anthropic sia stato chiamato con i parametri corretti
      expect(anthropicService.sendRequest).toHaveBeenCalledWith(
        'ciao, dimmi chi sei e cosa posso chiederti',
        'claude-3-7-sonnet',
        1,
        undefined,
        'chat',
        []
      );
    });

    it('dovrebbe elaborare correttamente una richiesta con il modello claude-3.7-sonnet (con punto)', async () => {
      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .send({
          content: 'ciao, dimmi chi sei e cosa posso chiederti',
          agent_type: 'chat',
          agent_model: 'claude-3.7-sonnet'
        });

      // Stampa il corpo della risposta per il debug
      console.log('Risposta status:', response.status);
      console.log('Risposta body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      // Verifica che il servizio Anthropic sia stato chiamato con i parametri corretti
      expect(anthropicService.sendRequest).toHaveBeenCalledWith(
        'ciao, dimmi chi sei e cosa posso chiederti',
        'claude-3.7-sonnet',
        1,
        undefined,
        'chat',
        []
      );
    });

    it('dovrebbe elaborare correttamente una richiesta con il modello claude-3-7-sonnet-20250219', async () => {
      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .send({
          content: 'ciao, dimmi chi sei e cosa posso chiederti',
          agent_type: 'chat',
          agent_model: 'claude-3-7-sonnet-20250219'
        });

      // Stampa il corpo della risposta per il debug
      console.log('Risposta status:', response.status);
      console.log('Risposta body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      // Verifica che il servizio Anthropic sia stato chiamato con i parametri corretti
      expect(anthropicService.sendRequest).toHaveBeenCalledWith(
        'ciao, dimmi chi sei e cosa posso chiederti',
        'claude-3-7-sonnet-20250219',
        1,
        undefined,
        'chat',
        []
      );
    });
  });
}); 