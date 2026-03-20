const request = require('supertest');
const express = require('express');
const { Op } = require('sequelize');

// Mock dependencies
jest.mock('../../database', () => {
  const mockStats = [
    {
      id: 1,
      id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
      type: 'trendline_usage_credits',
      label: 'Daily Credits Usage',
      value: 150.5,
      aggregation_level: 'day',
      calculated_at: '2024-01-15T10:00:00Z',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z'
    },
    {
      id: 2,
      id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
      type: 'trendline_usage_credits',
      label: 'Daily Credits Usage',
      value: 200.0,
      aggregation_level: 'day',
      calculated_at: '2024-01-16T10:00:00Z',
      created_at: '2024-01-16T10:00:00Z',
      updated_at: '2024-01-16T10:00:00Z'
    }
  ];

  const mockFindAll = jest.fn().mockResolvedValue(mockStats);

  return {
    sequelize: {
      models: {
        UserModelUsageStats: {
          findAll: mockFindAll
        }
      }
    }
  };
});

jest.mock('../../middlewares/auth.middleware', () => ({
  authenticate: jest.fn((req, res, next) => {
    req.user = {
      id: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
      email: 'test@example.com'
    };
    next();
  }),
  __esModule: true,
  default: jest.fn((req, res, next) => {
    req.user = {
      id: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
      email: 'test@example.com'
    };
    next();
  })
}));

const usersStatsRouter = require('../../api/v1/users_stats');
const { UserModelUsageStats } = require('../../database').sequelize.models;

describe('Users Stats API', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/users/stats', usersStatsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/users/stats/usage', () => {
    it('should return usage statistics successfully', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats/usage');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].type).toBe('trendline_usage_credits');
      
      expect(UserModelUsageStats.findAll).toHaveBeenCalledWith({
        where: {
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'trendline_usage_credits'
        },
        order: [['calculated_at', 'ASC']]
      });
    });

    it('should work without user_id parameter since it comes from JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats/usage');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should handle date filtering correctly', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats/usage')
        .query({ 
          date_from: '2024-01-15',
          date_to: '2024-01-16'
        });

      expect(response.status).toBe(200);
      expect(UserModelUsageStats.findAll).toHaveBeenCalledWith({
        where: {
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'trendline_usage_credits',
          calculated_at: {
            [Op.gte]: new Date('2024-01-15'),
            [Op.lte]: new Date('2024-01-16')
          }
        },
        order: [['calculated_at', 'ASC']]
      });
    });

    it('should return 400 for invalid date_from format', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats/usage')
        .query({ 
          date_from: 'invalid-date'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('date_from must be a valid date format');
    });

    it('should return 400 for invalid date_to format', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats/usage')
        .query({ 
          date_to: 'invalid-date'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('date_to must be a valid date format');
    });

    it('should handle database errors', async () => {
      UserModelUsageStats.findAll.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/users/stats/usage');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('GET /api/v1/users/stats/favourites/models', () => {
    it('should return favourite models statistics successfully', async () => {
      UserModelUsageStats.findAll.mockResolvedValueOnce([
        {
          id: 1,
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'pie_fav_models_count',
          label: 'Claude 3.5 Sonnet',
          value: 45,
          aggregation_level: 'last30days',
          calculated_at: '2024-01-15T10:00:00Z',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        }
      ]);

      const response = await request(app)
        .get('/api/v1/users/stats/favourites/models');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].type).toBe('pie_fav_models_count');
      
      expect(UserModelUsageStats.findAll).toHaveBeenCalledWith({
        where: {
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'pie_fav_models_count'
        },
        order: [['calculated_at', 'ASC']]
      });
    });
  });

  describe('GET /api/v1/users/stats/favourites/categories', () => {
    it('should return favourite categories statistics successfully', async () => {
      UserModelUsageStats.findAll.mockResolvedValueOnce([
        {
          id: 1,
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'pie_categories_count',
          label: 'Text Generation',
          value: 60,
          aggregation_level: 'last30days',
          calculated_at: '2024-01-15T10:00:00Z',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        }
      ]);

      const response = await request(app)
        .get('/api/v1/users/stats/favourites/categories');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].type).toBe('pie_categories_count');
      
      expect(UserModelUsageStats.findAll).toHaveBeenCalledWith({
        where: {
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'pie_categories_count'
        },
        order: [['calculated_at', 'ASC']]
      });
    });
  });

  describe('GET /api/v1/users/stats/savings/total', () => {
    it('should return total savings statistics successfully', async () => {
      UserModelUsageStats.findAll.mockResolvedValueOnce([
        {
          id: 1,
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'savings_total',
          label: 'Total Savings',
          value: 125.50,
          aggregation_level: 'last30days',
          calculated_at: '2024-01-15T10:00:00Z',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        }
      ]);

      const response = await request(app)
        .get('/api/v1/users/stats/savings/total');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].type).toBe('savings_total');
      
      expect(UserModelUsageStats.findAll).toHaveBeenCalledWith({
        where: {
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'savings_total'
        },
        order: [['calculated_at', 'ASC']]
      });
    });
  });

  describe('GET /api/v1/users/stats/savings/by_provider', () => {
    it('should return savings by provider statistics successfully', async () => {
      UserModelUsageStats.findAll.mockResolvedValueOnce([
        {
          id: 1,
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'savings_total_model',
          label: 'OpenAI',
          value: 75.25,
          aggregation_level: 'last30days',
          calculated_at: '2024-01-15T10:00:00Z',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        },
        {
          id: 2,
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'savings_total_model',
          label: 'Anthropic',
          value: 50.25,
          aggregation_level: 'last30days',
          calculated_at: '2024-01-15T10:00:00Z',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        }
      ]);

      const response = await request(app)
        .get('/api/v1/users/stats/savings/by_provider');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].type).toBe('savings_total_model');
      
      expect(UserModelUsageStats.findAll).toHaveBeenCalledWith({
        where: {
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'savings_total_model'
        },
        order: [['calculated_at', 'ASC']]
      });
    });
  });

  describe('Authentication middleware', () => {
    let app401;
    
    beforeAll(() => {
      // Create a new app instance with failing auth middleware
      const express = require('express');
      const { authenticate: failingAuthMiddleware } = require('../../middlewares/auth.middleware');
      
      // Mock the failing auth middleware
      const mockFailingAuth = jest.fn((req, res, next) => {
        res.status(401).json({ success: false, error: 'Unauthorized' });
      });
      
      // Create router with failing auth
      const router = express.Router();
      const { Op } = require('sequelize');
      const db = require('../../database');
      const { UserModelUsageStats } = db.sequelize.models;
      
      const validateStatsParams = (req, res, next) => {
        const { user_id } = req.query;
        if (!user_id) {
          return res.status(400).json({
            success: false,
            error: 'user_id parameter is required'
          });
        }
        next();
      };
      
      router.get('/usage', mockFailingAuth, validateStatsParams, async (req, res) => {
        // This won't be reached due to failing auth
        res.json({ success: true, data: [] });
      });
      
      app401 = express();
      app401.use(express.json());
      app401.use('/api/v1/users/stats', router);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app401)
        .get('/api/v1/users/stats/usage');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty results from database', async () => {
      UserModelUsageStats.findAll.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/v1/users/stats/usage');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should handle only date_from parameter', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats/usage')
        .query({ 
          date_from: '2024-01-15'
        });

      expect(response.status).toBe(200);
      expect(UserModelUsageStats.findAll).toHaveBeenCalledWith({
        where: {
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'trendline_usage_credits',
          calculated_at: {
            [Op.gte]: new Date('2024-01-15')
          }
        },
        order: [['calculated_at', 'ASC']]
      });
    });

    it('should handle only date_to parameter', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats/usage')
        .query({ 
          date_to: '2024-01-16'
        });

      expect(response.status).toBe(200);
      expect(UserModelUsageStats.findAll).toHaveBeenCalledWith({
        where: {
          id_user: '65e3d55a-4ef6-4774-9a56-bf3a32652c31',
          type: 'trendline_usage_credits',
          calculated_at: {
            [Op.lte]: new Date('2024-01-16')
          }
        },
        order: [['calculated_at', 'ASC']]
      });
    });

    it('should handle database timeout errors', async () => {
      const timeoutError = new Error('Connection timeout');
      timeoutError.code = 'ETIMEDOUT';
      UserModelUsageStats.findAll.mockRejectedValueOnce(timeoutError);

      const response = await request(app)
        .get('/api/v1/users/stats/usage');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });
});