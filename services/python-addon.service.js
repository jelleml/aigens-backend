const axios = require('axios');
const config = require('../config/config');

/**
 * Service for communicating with Python Addon API
 * Handles authentication, token management, and API calls
 */
class PythonAddonService {
  constructor() {
    this.baseURL = process.env.API_PYTHON_ADDON_URL;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.username = process.env.API_PYTHON_ADDON_USERNAME;
    this.password = process.env.API_PYTHON_ADDON_PASSWORD;

    if (!this.username || !this.password) {
      throw new Error('Python addon credentials not found in environment variables');
    }

    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Authenticate with the Python addon service
   * @returns {Promise<string>} Access token
   */
  async authenticate() {
    try {
      console.log('Python addon: Attempting authentication...');

      const response = await this.client.post('/auth/login', {
        username: this.username,
        password: this.password
      });

      if (response.data.status !== 'success') {
        console.error('Python addon authentication failed: Invalid response status', response.data);
        throw new Error('Authentication failed: Invalid response status');
      }

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;

      // Calculate token expiry time (subtract 60 seconds for safety margin)
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = Date.now() + ((expiresIn - 60) * 1000);

      console.log('Python addon: Authentication successful, token expires in', expiresIn, 'seconds');
      return this.accessToken;
    } catch (error) {
      if (error.response) {
        console.error('Python addon authentication failed - HTTP error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      } else if (error.request) {
        console.error('Python addon authentication failed - Network error:', error.message);
      } else {
        console.error('Python addon authentication failed - Unknown error:', error.message);
      }
      throw new Error(error.message);
    }
  }

  /**
   * Get valid access token, refreshing if necessary
   * @returns {Promise<string>} Valid access token
   */
  async getValidToken() {
    // If no token or token is expired, authenticate
    if (!this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry) {
      return await this.authenticate();
    }

    return this.accessToken;
  }

  /**
   * Make authenticated request to Python addon API
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {string} method - HTTP method (default: POST)
   * @returns {Promise<Object>} API response data
   */
  async makeAuthenticatedRequest(endpoint, data = {}, method = 'POST') {
    try {
      const token = await this.getValidToken();

      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      let response;
      if (method.toUpperCase() === 'GET') {
        response = await this.client.get(endpoint, config);
      } else {
        response = await this.client.post(endpoint, data, config);
      }

      return response.data;
    } catch (error) {
      // If authentication error, try once more with fresh token
      if (error.response?.status === 401) {
        try {
          console.log('Token expired, re-authenticating...');
          const newToken = await this.authenticate();

          const config = {
            headers: {
              'Authorization': `Bearer ${newToken}`,
              'Content-Type': 'application/json'
            }
          };

          let response;
          if (method.toUpperCase() === 'GET') {
            response = await this.client.get(endpoint, config);
          } else {
            response = await this.client.post(endpoint, data, config);
          }

          return response.data;
        } catch (retryError) {
          console.error('Retry authentication failed:', retryError.message);
          throw new Error('Errore controllo credito');
        }
      }

      console.error(`Python addon API error (${endpoint}):`, error.message);
      throw new Error('Errore controllo credito');
    }
  }

  /**
   * Get expected cost for a prompt
   * @param {string} prompt - The user prompt
   * @param {string} model - Model identifier
   * @param {string} calculationMethod - Calculation method (default: "categories")
   * @param {string} selectorModel - Selector model (default: "Qwen/Qwen2.5-7B-Instruct-Turbo")
   * @param {number} numberOfAttachments - Number of attachments (default: 0)
   * @param {boolean} verbose - Verbose output (default: false)
   * @returns {Promise<Object>} Cost estimation data
   */
  async getExpectedCost(
    prompt,
    model,
    calculationMethod = 'categories',
    selectorModel = 'Qwen/Qwen2.5-7B-Instruct-Turbo',
    numberOfAttachments = 0,
    verbose = false
  ) {
    try {
      console.log('Python addon: Requesting cost estimation for model:', model);

      const requestData = {
        prompt,
        model,
        calculation_method: calculationMethod,
        selector_model: selectorModel,
        number_of_attachments: numberOfAttachments,
        verbose
      };

      const response = await this.makeAuthenticatedRequest('/prompt/expected-cost', requestData);

      if (response.status !== 'success') {
        console.error('Python addon cost estimation failed: Invalid response status', response);
        throw new Error('Cost estimation failed: Invalid response status');
      }

      const totalCost = this.extractTotalCostTokens(response.cost_estimation);
      console.log('Python addon: Cost estimation successful, total cost:', totalCost, 'tokens');

      return response.cost_estimation;
    } catch (error) {
      // Check for specific model not found error
      if (error.message && error.message.includes('not found in database')) {
        const modelName = model || 'unknown';
        console.error('Python addon: Model not found:', modelName);
        throw new Error(`Model '${modelName}' not found in database`);
      }

      // Check for HTTP response errors
      if (error.response) {
        console.error('Python addon cost estimation failed - HTTP error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          model: model
        });
      } else {
        console.error('Python addon cost estimation failed:', {
          message: error.message,
          model: model,
          promptLength: prompt?.length || 0
        });
      }

      throw new Error('Errore controllo credito');
    }
  }

  /**
   * Categorize a prompt (background operation)
   * @param {string} prompt - The user prompt
   * @param {boolean} verbose - Verbose output (default: false)
   * @returns {Promise<Object>} Categorization data
   */
  async categorizePrompt(prompt, verbose = false) {
    try {
      console.log('Python addon: Requesting prompt categorization...');

      const requestData = {
        prompt,
        verbose
      };

      const response = await this.makeAuthenticatedRequest('/prompt/categorize', requestData);

      if (response.status !== 'success') {
        console.error('Python addon categorization failed: Invalid response status', response);
        throw new Error('Categorization failed: Invalid response status');
      }

      console.log('Python addon: Categorization successful, categories found:',
        response.categorization?.anthropic_categories?.length || 0);

      return response.categorization;
    } catch (error) {
      if (error.response) {
        console.error('Python addon categorization failed - HTTP error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          promptLength: prompt?.length || 0
        });
      } else {
        console.error('Python addon categorization failed:', {
          message: error.message,
          promptLength: prompt?.length || 0
        });
      }

      // Don't throw error for background operation - just return null
      return null;
    }
  }

  /**
   * Extract total cost in tokens from cost estimation response
   * @param {Object} costEstimation - Cost estimation response
   * @returns {number} Total cost in tokens
   */
  extractTotalCostTokens(costEstimation) {
    try {
      return costEstimation?.expected_costs?.total_cost_tokens || 0;
    } catch (error) {
      console.error('Error extracting total cost tokens:', error.message);
      return 0;
    }
  }

  /**
   * Extract model information from cost estimation response
   * @param {Object} costEstimation - Cost estimation response
   * @returns {Object} Model information
   */
  extractModelInfo(costEstimation) {
    try {
      const expectedCosts = costEstimation?.expected_costs || {};
      return {
        modelFound: expectedCosts.model_found || null,
        modelId: expectedCosts.model_id || null,
        modelName: expectedCosts.model_name || null
      };
    } catch (error) {
      console.error('Error extracting model info:', error.message);
      return {
        modelFound: null,
        modelId: null,
        modelName: null
      };
    }
  }

  /**
   * Report user usage statistics to Python addon
   * @param {string} userToken - User authentication token (kept for potential future use)
   * @param {Array<string>} aggregationNames - List of aggregation categories for stats
   * @param {Object} messageData - Message impact data
   * @param {string} timeRangePeriod - Time range period for stats (default: "today")
   * @param {boolean} overwrite - Whether to overwrite existing stats (default: true)
   * @returns {Promise<Object>} API response
   */
  async reportUsageStats(userToken, aggregationNames, messageData, timeRangePeriod = "today", overwrite = true) {
    try {
      console.log('Python addon: Reporting usage statistics...');

      const requestData = {
        user_id: messageData.user_id,
        time_range_period: timeRangePeriod,
        overwrite: overwrite,
        aggregation_names: aggregationNames
      };

      // Use the same service authentication as all other Python addon calls
      const response = await this.makeAuthenticatedRequest('/db_manager/users/usage_stats', requestData);

      if (response.status !== 'success' && response.status !== 'warning') {
        console.error('Python addon usage stats reporting failed: Invalid response status', response);
        throw new Error('Usage stats reporting failed: Invalid response status');
      }

      console.log('Python addon: Usage statistics reported successfully');
      return response;
    } catch (error) {
      console.error('Python addon usage stats reporting failed:', error.message);
      throw new Error('Failed to report usage statistics');
    }
  }
}

// Create singleton instance
const pythonAddonService = new PythonAddonService();

module.exports = pythonAddonService;