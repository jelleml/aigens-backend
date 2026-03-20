const anthropicService = require('../../services/anthropic.service');
const modelService = require('../../services/model.service');

// Mock modelService
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

// Mock delle dipendenze
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => {
    return {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Sono Claude, un assistente AI sviluppato da Anthropic.' }],
          usage: {
            input_tokens: 100,
            output_tokens: 200
          }
        })
      }
    };
  });
});

jest.mock('../../database', () => {
  const mockSequelize = {
    models: {
      User: {
        findByPk: jest.fn()
      },
      Chat: {
        findByPk: jest.fn(),
        findOne: jest.fn()
      },
      Message: {
        create: jest.fn(),
        findOne: jest.fn()
      },
      Attachment: {
        create: jest.fn(),
        destroy: jest.fn()
      },
      Wallet: {
        findOne: jest.fn()
      },
      Transaction: {
        create: jest.fn()
      },
      MessageCost: {
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

describe('Anthropic Service', () => {
  const db = require('../../database');

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock delle risposte dei modelli
    db.sequelize.models.User.findByPk.mockResolvedValue({ id: 1 });
    db.sequelize.models.Chat.findByPk.mockResolvedValue({ id: 1, last_message_at: new Date(), save: jest.fn() });
    db.sequelize.models.Chat.findOne.mockResolvedValue({ id: 1, last_message_at: new Date(), save: jest.fn() });
    db.sequelize.models.Message.create.mockImplementation((data) => Promise.resolve({ ...data, id: 1, destroy: jest.fn() }));
    db.sequelize.models.Message.findOne.mockResolvedValue({ id: 1, role: 'assistant', content: 'Test response' });
    db.sequelize.models.Wallet.findOne.mockResolvedValue({ id: 1, balance: 100.0, currency: 'USD', save: jest.fn() });
    db.sequelize.models.Transaction.create.mockResolvedValue({ id: 1 });
    db.sequelize.models.MessageCost.create.mockResolvedValue({ id: 1 });
    db.sequelize.models.Model.findOne.mockResolvedValue({
      id: 1,
      model_id: 'claude-3-7-sonnet-20250219',
      provider: 'anthropic',
      is_active: true
    });
    db.sequelize.models.Model.findAll.mockResolvedValue([
      {
        id: 1,
        model_id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        description: 'Latest Claude model',
        provider: 'anthropic',
        is_active: true,
        input_price_per_million: 8,
        output_price_per_million: 24
      }
    ]);
  });

  describe('processAnthropicRequest', () => {
    it('dovrebbe elaborare correttamente una richiesta con il modello claude-3-7-sonnet', async () => {
      const requestData = {
        model: 'claude-3-7-sonnet',
        prompt: 'Ciao, dimmi chi sei e cosa posso chiederti',
        chatId: 1,
        userId: 1,
        agent_type: 'chat',
        agent_model: 'claude-3-7-sonnet'
      };

      const response = await anthropicService.processAnthropicRequest(requestData);

      // Verifica che il modello sia stato corretto a claude-3-7-sonnet-20250219
      expect(response).toBeDefined();
      expect(response.success).toBe(true);

      // Verifica che il messaggio dell'utente sia stato salvato
      expect(db.sequelize.models.Message.create).toHaveBeenCalledWith(expect.objectContaining({
        chat_id: 1,
        role: 'user',
        content: 'Ciao, dimmi chi sei e cosa posso chiederti',
        agent_type: 'chat',
        agent_model: 'claude-3-7-sonnet'
      }));

      // Verifica che il messaggio dell'assistente sia stato salvato
      expect(db.sequelize.models.Message.create).toHaveBeenCalledWith(expect.objectContaining({
        chat_id: 1,
        role: 'assistant'
      }));

      // Verifica che il costo del messaggio sia stato salvato
      expect(db.sequelize.models.MessageCost.create).toHaveBeenCalled();

      // Verifica che il saldo del wallet sia stato aggiornato
      expect(db.sequelize.models.Wallet.findOne).toHaveBeenCalled();
      expect(db.sequelize.models.Transaction.create).toHaveBeenCalled();
    });

    it('dovrebbe elaborare correttamente una richiesta con il modello claude-3.7-sonnet (con punto)', async () => {
      const requestData = {
        model: 'claude-3.7-sonnet',
        prompt: 'Ciao, dimmi chi sei e cosa posso chiederti',
        chatId: 1,
        userId: 1,
        agent_type: 'chat',
        agent_model: 'claude-3.7-sonnet'
      };

      const response = await anthropicService.processAnthropicRequest(requestData);

      // Verifica che il modello sia stato corretto a claude-3-7-sonnet-20250219
      expect(response).toBeDefined();
      expect(response.success).toBe(true);

      // Verifica che il messaggio dell'utente sia stato salvato
      expect(db.sequelize.models.Message.create).toHaveBeenCalledWith(expect.objectContaining({
        chat_id: 1,
        role: 'user',
        content: 'Ciao, dimmi chi sei e cosa posso chiederti',
        agent_type: 'chat',
        agent_model: 'claude-3.7-sonnet'
      }));
    });

    it('dovrebbe elaborare correttamente una richiesta con il modello claude-3-7-sonnet-20250219', async () => {
      const requestData = {
        model: 'claude-3-7-sonnet-20250219',
        prompt: 'Ciao, dimmi chi sei e cosa posso chiederti',
        chatId: 1,
        userId: 1,
        agent_type: 'chat',
        agent_model: 'claude-3-7-sonnet-20250219'
      };

      const response = await anthropicService.processAnthropicRequest(requestData);

      // Verifica che il modello sia stato utilizzato correttamente
      expect(response).toBeDefined();
      expect(response.success).toBe(true);
    });
  });

  describe('sendRequest', () => {
    it('dovrebbe inviare correttamente una richiesta con il modello claude-3-7-sonnet', async () => {
      const prompt = 'Ciao, dimmi chi sei e cosa posso chiederti';
      const model = 'claude-3-7-sonnet';
      const userId = 1;
      const chatId = 1;
      const agentType = 'chat';

      const response = await anthropicService.sendRequest(prompt, model, userId, chatId, agentType);

      // Verifica che la risposta sia corretta
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });

    it('dovrebbe inviare correttamente una richiesta con il modello claude-3.7-sonnet (con punto)', async () => {
      const prompt = 'Ciao, dimmi chi sei e cosa posso chiederti';
      const model = 'claude-3.7-sonnet';
      const userId = 1;
      const chatId = 1;
      const agentType = 'chat';

      const response = await anthropicService.sendRequest(prompt, model, userId, chatId, agentType);

      // Verifica che la risposta sia corretta
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });
  });

  describe('isModelAvailable', () => {
    it('dovrebbe riconoscere claude-3-7-sonnet come modello disponibile', async () => {
      const isAvailable = await anthropicService.isModelAvailable('claude-3-7-sonnet');
      expect(isAvailable).toBe(true);
    });

    it('dovrebbe riconoscere claude-3.7-sonnet come modello disponibile', async () => {
      const isAvailable = await anthropicService.isModelAvailable('claude-3.7-sonnet');
      expect(isAvailable).toBe(true);
    });

    it('dovrebbe riconoscere claude-3-7-sonnet-20250219 come modello disponibile', async () => {
      const isAvailable = await anthropicService.isModelAvailable('claude-3-7-sonnet-20250219');
      expect(isAvailable).toBe(true);
    });
  });
}); 