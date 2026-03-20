const axios = require('axios');
const PythonAddonService = require('../../services/python-addon.service');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

describe('PythonAddonService', () => {
  let service;
  let mockAxiosInstance;

  beforeEach(() => {
    // Reset environment variables
    process.env.API_PYTHON_ADDON_USERNAME = 'test_user';
    process.env.API_PYTHON_ADDON_PASSWORD = 'test_password';

    // Create mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn()
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

    // Create new service instance
    service = new (require('../../services/python-addon.service').constructor)();
    
    // Clear any cached tokens
    service.accessToken = null;
    service.refreshToken = null;
    service.tokenExpiry = null;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should throw error if credentials are missing', () => {
      delete process.env.API_PYTHON_ADDON_USERNAME;
      delete process.env.API_PYTHON_ADDON_PASSWORD;

      expect(() => {
        new (require('../../services/python-addon.service').constructor)();
      }).toThrow('Python addon credentials not found in environment variables');
    });

    it('should initialize with correct configuration', () => {
      expect(service.baseURL).toBe('http://localhost:8001/api/v1');
      expect(service.username).toBe('test_user');
      expect(service.password).toBe('test_password');
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8001/api/v1',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });
  });

  describe('authenticate', () => {
    it('should authenticate successfully and store tokens', async () => {
      const mockResponse = {
        data: {
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          expires_in: 3600,
          status: 'success'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const token = await service.authenticate();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/login', {
        username: 'test_user',
        password: 'test_password'
      });

      expect(token).toBe('test_access_token');
      expect(service.accessToken).toBe('test_access_token');
      expect(service.refreshToken).toBe('test_refresh_token');
      expect(service.tokenExpiry).toBeGreaterThan(Date.now());
    });

    it('should throw error on authentication failure', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect(service.authenticate()).rejects.toThrow('Errore controllo credito');
    });

    it('should throw error on invalid response status', async () => {
      const mockResponse = {
        data: {
          status: 'error',
          message: 'Invalid credentials'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await expect(service.authenticate()).rejects.toThrow('Errore controllo credito');
    });
  });

  describe('getValidToken', () => {
    it('should return existing valid token', async () => {
      service.accessToken = 'existing_token';
      service.tokenExpiry = Date.now() + 1000000; // Future expiry

      const token = await service.getValidToken();

      expect(token).toBe('existing_token');
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
    });

    it('should authenticate if no token exists', async () => {
      const mockResponse = {
        data: {
          access_token: 'new_token',
          refresh_token: 'new_refresh_token',
          expires_in: 3600,
          status: 'success'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const token = await service.getValidToken();

      expect(token).toBe('new_token');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/login', {
        username: 'test_user',
        password: 'test_password'
      });
    });

    it('should authenticate if token is expired', async () => {
      service.accessToken = 'expired_token';
      service.tokenExpiry = Date.now() - 1000; // Past expiry

      const mockResponse = {
        data: {
          access_token: 'new_token',
          refresh_token: 'new_refresh_token',
          expires_in: 3600,
          status: 'success'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const token = await service.getValidToken();

      expect(token).toBe('new_token');
    });
  });

  describe('makeAuthenticatedRequest', () => {
    beforeEach(() => {
      service.accessToken = 'valid_token';
      service.tokenExpiry = Date.now() + 1000000;
    });

    it('should make POST request with authentication header', async () => {
      const mockResponse = { data: { status: 'success' } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await service.makeAuthenticatedRequest('/test', { test: 'data' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/test', { test: 'data' }, {
        headers: {
          'Authorization': 'Bearer valid_token',
          'Content-Type': 'application/json'
        }
      });

      expect(result).toEqual({ status: 'success' });
    });

    it('should make GET request with authentication header', async () => {
      const mockResponse = { data: { status: 'success' } };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.makeAuthenticatedRequest('/test', {}, 'GET');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', {
        headers: {
          'Authorization': 'Bearer valid_token',
          'Content-Type': 'application/json'
        }
      });

      expect(result).toEqual({ status: 'success' });
    });

    it('should retry with new token on 401 error', async () => {
      const authError = new Error('Unauthorized');
      authError.response = { status: 401 };

      const authResponse = {
        data: {
          access_token: 'new_token',
          refresh_token: 'new_refresh_token',
          expires_in: 3600,
          status: 'success'
        }
      };

      const successResponse = { data: { status: 'success' } };

      mockAxiosInstance.post
        .mockRejectedValueOnce(authError)
        .mockResolvedValueOnce(authResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await service.makeAuthenticatedRequest('/test', { test: 'data' });

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ status: 'success' });
    });

    it('should throw error on non-401 errors', async () => {
      const networkError = new Error('Network error');
      mockAxiosInstance.post.mockRejectedValue(networkError);

      await expect(service.makeAuthenticatedRequest('/test', { test: 'data' }))
        .rejects.toThrow('Errore controllo credito');
    });
  });

  describe('getExpectedCost', () => {
    beforeEach(() => {
      service.accessToken = 'valid_token';
      service.tokenExpiry = Date.now() + 1000000;
    });

    it('should get cost estimation successfully', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          cost_estimation: {
            estimated_output_tokens: 1050,
            expected_costs: {
              currency: 'EUR',
              total_cost_tokens: 0.632,
              model_found: 'gpt-4o-openai',
              model_id: 1,
              model_name: 'GPT-4o'
            }
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await service.getExpectedCost('test prompt', 'gpt-4');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/prompt/expected-cost', {
        prompt: 'test prompt',
        model: 'gpt-4',
        calculation_method: 'categories',
        selector_model: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
        number_of_attachments: 0,
        verbose: false
      }, expect.any(Object));

      expect(result).toEqual(mockResponse.data.cost_estimation);
    });

    it('should handle model not found error', async () => {
      const error = new Error('Model gpt-5 not found in database');
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(service.getExpectedCost('test prompt', 'gpt-5'))
        .rejects.toThrow("Model 'gpt-5' not found in database");
    });

    it('should throw generic error on other failures', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect(service.getExpectedCost('test prompt', 'gpt-4'))
        .rejects.toThrow('Errore controllo credito');
    });

    it('should handle custom parameters', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          cost_estimation: { estimated_output_tokens: 500 }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await service.getExpectedCost(
        'test prompt',
        'claude-3',
        'advanced',
        'custom-model',
        2,
        true
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/prompt/expected-cost', {
        prompt: 'test prompt',
        model: 'claude-3',
        calculation_method: 'advanced',
        selector_model: 'custom-model',
        number_of_attachments: 2,
        verbose: true
      }, expect.any(Object));
    });
  });

  describe('categorizePrompt', () => {
    beforeEach(() => {
      service.accessToken = 'valid_token';
      service.tokenExpiry = Date.now() + 1000000;
    });

    it('should categorize prompt successfully', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          categorization: {
            anthropic_categories: ['Computer & Mathematical', 'Arts & Media'],
            model_used: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
            original_text: 'test prompt',
            task_complexity: 'medium',
            task_topic: ['translate', 'writing'],
            task_type: ['TEXT']
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await service.categorizePrompt('test prompt');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/prompt/categorize', {
        prompt: 'test prompt',
        verbose: false
      }, expect.any(Object));

      expect(result).toEqual(mockResponse.data.categorization);
    });

    it('should return null on error (background operation)', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      const result = await service.categorizePrompt('test prompt');

      expect(result).toBeNull();
    });

    it('should handle verbose parameter', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          categorization: { task_type: ['TEXT'] }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await service.categorizePrompt('test prompt', true);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/prompt/categorize', {
        prompt: 'test prompt',
        verbose: true
      }, expect.any(Object));
    });
  });

  describe('extractTotalCostTokens', () => {
    it('should extract total cost tokens correctly', () => {
      const costEstimation = {
        expected_costs: {
          total_cost_tokens: 0.632
        }
      };

      const result = service.extractTotalCostTokens(costEstimation);
      expect(result).toBe(0.632);
    });

    it('should return 0 for invalid data', () => {
      expect(service.extractTotalCostTokens(null)).toBe(0);
      expect(service.extractTotalCostTokens({})).toBe(0);
      expect(service.extractTotalCostTokens({ expected_costs: {} })).toBe(0);
    });
  });

  describe('extractModelInfo', () => {
    it('should extract model info correctly', () => {
      const costEstimation = {
        expected_costs: {
          model_found: 'gpt-4o-openai',
          model_id: 1,
          model_name: 'GPT-4o'
        }
      };

      const result = service.extractModelInfo(costEstimation);
      expect(result).toEqual({
        modelFound: 'gpt-4o-openai',
        modelId: 1,
        modelName: 'GPT-4o'
      });
    });

    it('should return null values for invalid data', () => {
      const result = service.extractModelInfo({});
      expect(result).toEqual({
        modelFound: null,
        modelId: null,
        modelName: null
      });
    });
  });
});