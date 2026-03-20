const request = require('supertest');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Mock delle dipendenze
jest.mock('../../services/anthropic.service', () => ({
  sendRequest: jest.fn().mockResolvedValue({
    fullText: 'Sono Claude, un assistente AI sviluppato da Anthropic.',
    inputTokens: 100,
    outputTokens: 200,
    cost: {
      totalCost: 0.05,
      baseCost: 0.035,
      fixedMarkup: 0.005,
      percentageMarkup: 0.01,
      totalMarkup: 0.015
    }
  }),
  calculateCost: jest.fn().mockResolvedValue({
    totalCost: 0.05,
    baseCost: 0.035,
    fixedMarkup: 0.005,
    percentageMarkup: 0.01,
    totalMarkup: 0.015
  })
}));

// Mock del model service per testare la risoluzione del servizio
jest.mock('../../services/model.service', () => ({
  resolveStreamingService: jest.fn().mockResolvedValue({
    service: 'anthropicService',
    provider: 'anthropic',
    providerType: 'direct',
    modelSlug: 'claude-3-7-sonnet-anthropic'
  }),
  getModelServiceInfo: jest.fn().mockResolvedValue({
    model: {
      id: 1,
      model_slug: 'claude-3-7-sonnet-anthropic',
      api_model_id: 'claude-3-7-sonnet-20250219',
      id_provider: 1
    },
    provider: {
      id: 1,
      name: 'anthropic',
      provider_type: 'direct'
    },
    aggregatedInfo: null
  })
}));

jest.mock('../../services/deepseek.service', () => ({
  sendRequest: jest.fn()
}));

jest.mock('../../services/cost-calculator.service', () => {
  return class MockCostCalculator {
    async calculateCost() {
      return {
        input_tokens: 100,
        output_tokens: 200,
        total_tokens: 300,
        price_1m_input_tokens: 0.25,
        price_1m_output_tokens: 1.25,
        fixed_markup_perc: 15,
        fixed_markup_value: 0.005,
        markup_perc: 15,
        markup_value: 0.01,
        total_markup: 0.015,
        total_cost_for_user: 0.05,
        total_cost_aigens: 0.035,
        total_margin_value: 0.015,
        base_cost: 0.035,
        baseCost: 0.035,
        fixedMarkup: 0.005,
        percentageMarkup: 0.01,
        totalMarkup: 0.015,
        totalCost: 0.05
      };
    }
  };
});

jest.mock('../../database', () => {
  const mockSequelize = {
    transaction: jest.fn().mockImplementation(() => ({
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue()
    })),
    literal: jest.fn().mockImplementation((str) => str),
    models: {
      User: {
        findByPk: jest.fn()
      },
      Chat: {
        findByPk: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn()
      },
      Message: {
        findAll: jest.fn(),
        create: jest.fn(),
        findOne: jest.fn()
      },
      Wallet: {
        findOne: jest.fn(),
        update: jest.fn()
      },
      MessageCost: {
        create: jest.fn()
      },
      Attachment: {
        create: jest.fn()
      },
      Model: {
        findOne: jest.fn()
      },
      Provider: {
        findOne: jest.fn()
      },
      MessageSaveError: {
        create: jest.fn()
      }
    }
  };
  return {
    sequelize: mockSequelize,
    db: {
      sequelize: mockSequelize
    }
  };
});

// Mock del middleware di autenticazione
jest.mock('../../middlewares/auth.middleware', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1 };
    next();
  }
}));

// Importa il router dei messaggi
const messagesRouter = require('../../api/v1/messages');

// Crea un'app Express per i test
const app = express();
app.use(express.json());
app.use('/api/v1/chats/:chatId/messages', messagesRouter);
app.use('/api/v1/messages', messagesRouter);

describe('API Messages', () => {
  const anthropicService = require('../../services/anthropic.service');
  const { sequelize } = require('../../database');

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock delle risposte dei modelli
    sequelize.models.User.findByPk.mockResolvedValue({ id: 1 });
    sequelize.models.Chat.findByPk.mockResolvedValue({ id: 1, user_id: 1 });
    sequelize.models.Chat.findOne.mockResolvedValue({ id: 1, user_id: 1, save: jest.fn() });
    sequelize.models.Message.findAll.mockResolvedValue([]);
    sequelize.models.Message.create.mockImplementation((data) => Promise.resolve({ ...data, id: data.role === 'user' ? 1 : 2 }));
    sequelize.models.Message.findOne.mockImplementation((query) => {
      const id = query.where.id;
      return Promise.resolve({
        id,
        role: id === 1 ? 'user' : 'assistant',
        content: id === 1 ? 'User message' : 'Assistant message',
        MessageCost: { total_cost: 0.05 },
        Attachments: []
      });
    });
    sequelize.models.Wallet.findOne.mockResolvedValue({ id: 1, balance: 100.0, currency: 'USD', save: jest.fn() });
    sequelize.models.MessageCost.create.mockResolvedValue({ id: 1 });
    sequelize.models.Attachment.create.mockResolvedValue({ id: 1 });
    sequelize.models.Model.findOne.mockResolvedValue({
      id: 1,
      api_model_id: 'claude-3-7-sonnet-20250219',
      model_slug: 'claude-3-7-sonnet-anthropic',
      provider: { id: 1, name: 'anthropic' }
    });
    sequelize.models.Wallet.update.mockResolvedValue([1]);
    sequelize.models.Chat.update.mockResolvedValue([1]);
  });

  describe('POST /api/v1/chats/:chatId/messages', () => {
    const modelService = require('../../services/model.service');

    beforeEach(() => {
      // Spy on console methods to verify logging
      jest.spyOn(console, 'log').mockImplementation(() => { });
      jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
      console.log.mockRestore();
      console.error.mockRestore();
    });

    it('dovrebbe creare un nuovo messaggio con il modello claude-3-7-sonnet', async () => {
      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .field('content', 'Ciao, dimmi chi sei e cosa posso chiederti')
        .field('agent_type', 'chat')
        .field('id_model', '1');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      // Verifica che il servizio Anthropic sia stato chiamato
      expect(anthropicService.sendRequest).toHaveBeenCalledWith(
        'Ciao, dimmi chi sei e cosa posso chiederti',
        'claude-3-7-sonnet-20250219',
        1,
        '1',
        'chat',
        [],
        null
      );

      // Verifica che il servizio di risoluzione sia stato chiamato
      expect(modelService.resolveStreamingService).toHaveBeenCalledWith('claude-3-7-sonnet-20250219');

      // Verifica che il logging sia stato effettuato
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Resolving streaming service for model'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Service resolved successfully'));
    });

    it('dovrebbe creare un nuovo messaggio con il modello claude-3.7-sonnet (con punto)', async () => {
      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .field('content', 'Ciao, dimmi chi sei e cosa posso chiederti')
        .field('agent_type', 'chat')
        .field('id_model', '1');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      // Verifica che il servizio Anthropic sia stato chiamato
      expect(anthropicService.sendRequest).toHaveBeenCalledWith(
        'Ciao, dimmi chi sei e cosa posso chiederti',
        'claude-3-7-sonnet-20250219',
        1,
        '1',
        'chat',
        [],
        null
      );
    });

    it('dovrebbe creare un nuovo messaggio con il modello claude-3-7-sonnet-20250219', async () => {
      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .field('content', 'Ciao, dimmi chi sei e cosa posso chiederti')
        .field('agent_type', 'chat')
        .field('id_model', '1');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      // Verifica che il servizio Anthropic sia stato chiamato
      expect(anthropicService.sendRequest).toHaveBeenCalledWith(
        'Ciao, dimmi chi sei e cosa posso chiederti',
        'claude-3-7-sonnet-20250219',
        1,
        '1',
        'chat',
        [],
        null
      );
    });

    it('dovrebbe gestire errore quando il modello non è trovato nel database', async () => {
      // Mock error for model not found
      modelService.resolveStreamingService.mockRejectedValueOnce(new Error('Model not found: unknown-model'));

      // Override model ID for this test
      sequelize.models.Model.findOne.mockResolvedValueOnce({
        id: 999,
        api_model_id: 'unknown-model',
        model_slug: 'unknown-model',
        provider: { id: 1, name: 'anthropic' }
      });

      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .field('content', 'Ciao, dimmi chi sei e cosa posso chiederti')
        .field('agent_type', 'chat')
        .field('id_model', '999');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Modello non trovato nel database: unknown-model');

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error resolving streaming service for model'));
    });

    it('dovrebbe gestire errore quando il provider non è trovato', async () => {
      // Mock error for provider not found
      modelService.resolveStreamingService.mockRejectedValueOnce(new Error('Provider not found for model: test-model'));

      // Override model ID for this test
      sequelize.models.Model.findOne.mockResolvedValueOnce({
        id: 998,
        api_model_id: 'test-model',
        model_slug: 'test-model',
        provider: null
      });

      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .field('content', 'Ciao, dimmi chi sei e cosa posso chiederti')
        .field('agent_type', 'chat')
        .field('id_model', '998');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Provider non trovato per il modello: test-model');

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error resolving streaming service for model'));
    });

    it('dovrebbe gestire errore quando non c\'è servizio disponibile', async () => {
      // Mock error for no service available
      modelService.resolveStreamingService.mockRejectedValueOnce(new Error('No streaming service available for provider: unsupported'));

      // Override model ID for this test
      sequelize.models.Model.findOne.mockResolvedValueOnce({
        id: 997,
        api_model_id: 'unsupported-model',
        model_slug: 'unsupported-model',
        provider: { id: 99, name: 'unsupported' }
      });

      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .field('content', 'Ciao, dimmi chi sei e cosa posso chiederti')
        .field('agent_type', 'chat')
        .field('id_model', '997');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Nessun servizio di streaming disponibile per il modello: unsupported-model');

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error resolving streaming service for model'));
    });

    it('dovrebbe gestire errore di connessione al database', async () => {
      // Mock database connection error
      modelService.resolveStreamingService.mockRejectedValueOnce(new Error('Database connection error: Unable to retrieve model information'));

      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .field('content', 'Ciao, dimmi chi sei e cosa posso chiederti')
        .field('agent_type', 'chat')
        .field('id_model', '1');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Errore di connessione al database. Riprova più tardi.');

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error resolving streaming service for model'));
    });

    it('dovrebbe gestire errore quando l\'ID modello è mancante', async () => {
      // Mock error for missing model ID
      modelService.resolveStreamingService.mockRejectedValueOnce(new Error('Model slug is required'));

      const response = await request(app)
        .post('/api/v1/chats/1/messages')
        .field('content', 'Ciao, dimmi chi sei e cosa posso chiederti')
        .field('agent_type', 'chat')
        .field('id_model', '');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('ID modello non valido o mancante');

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error resolving streaming service for model'));
    });
  });

  describe('GET /api/v1/messages', () => {
    it('dovrebbe recuperare i messaggi recenti per il componente recent activity', async () => {
      const mockMessages = [
        {
          id: 1,
          created_at: '2023-01-01T10:00:00Z',
          agent_type: 'chat',
          agent_model: 'claude-3-7-sonnet-20250219',
          Chat: {
            title: 'Test Chat 1'
          },
          MessageCost: {
            total_cost: 0.05,
            model_used: 'claude-3-7-sonnet-20250219',
            Model: {
              name: 'Claude 3.7 Sonnet',
              provider: {
                name: 'Anthropic'
              }
            }
          }
        },
        {
          id: 2,
          created_at: '2023-01-01T09:00:00Z',
          agent_type: 'image',
          agent_model: 'gpt-4-vision',
          Chat: {
            title: 'Test Chat 2'
          },
          MessageCost: {
            total_cost: 0.03,
            model_used: 'gpt-4-vision',
            Model: {
              name: 'GPT-4 Vision',
              provider: {
                name: 'OpenAI'
              }
            }
          }
        }
      ];

      sequelize.models.Message.findAll.mockResolvedValue(mockMessages);

      const response = await request(app)
        .get('/api/v1/messages');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveLength(2);

      // Verifica struttura del primo messaggio
      const firstMessage = response.body.data[0];
      expect(firstMessage).toHaveProperty('id', 1);
      expect(firstMessage).toHaveProperty('date', '2023-01-01T10:00:00Z');
      expect(firstMessage).toHaveProperty('model_name', 'Claude 3.7 Sonnet');
      expect(firstMessage).toHaveProperty('provider', 'Anthropic');
      expect(firstMessage).toHaveProperty('category', 'chat');
      expect(firstMessage).toHaveProperty('total_cost', 0.05);
      expect(firstMessage).toHaveProperty('chat_name', 'Test Chat 1');

      // Verifica che la query sia stata chiamata con i parametri corretti
      expect(sequelize.models.Message.findAll).toHaveBeenCalledWith({
        attributes: [
          'id',
          'created_at',
          'agent_type',
          'agent_model'
        ],
        include: [
          {
            model: sequelize.models.Chat,
            attributes: ['title'],
            where: {
              user_id: 1
            }
          },
          {
            model: sequelize.models.MessageCost,
            attributes: ['total_cost', 'model_used'],
            include: [
              {
                model: sequelize.models.Model,
                attributes: ['name'],
                include: [
                  {
                    model: sequelize.models.Provider,
                    as: 'provider',
                    attributes: ['name']
                  }
                ]
              }
            ]
          }
        ],
        order: [['created_at', 'DESC']],
        limit: 100
      });
    });

    it('dovrebbe gestire il caso in cui non ci sono messaggi', async () => {
      sequelize.models.Message.findAll.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/messages');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('dovrebbe gestire valori mancanti con fallback appropriati', async () => {
      const mockMessages = [
        {
          id: 1,
          created_at: '2023-01-01T10:00:00Z',
          agent_type: 'chat',
          agent_model: 'claude-3-7-sonnet-20250219',
          Chat: null,
          MessageCost: null
        }
      ];

      sequelize.models.Message.findAll.mockResolvedValue(mockMessages);

      const response = await request(app)
        .get('/api/v1/messages');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);

      const message = response.body.data[0];
      expect(message.model_name).toBe('claude-3-7-sonnet-20250219');
      expect(message.provider).toBe('Unknown');
      expect(message.total_cost).toBe(0);
      expect(message.chat_name).toBe('Unknown Chat');
    });
  });
}); 