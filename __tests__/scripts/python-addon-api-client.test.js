/**
 * Unit tests for Python Addon API Client
 */

const pythonAddonApiClient = require('../../scripts/api-addons-py/python-addon-api-client');
const pythonAddonService = require('../../services/python-addon.service');

// Mock the python addon service
jest.mock('../../services/python-addon.service');

describe('Python Addon API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('refreshModelStats', () => {
    it('should successfully refresh model statistics', async () => {
      // Arrange
      const mockResponse = {
        status: 'success',
        message: 'Model statistics refreshed successfully'
      };
      pythonAddonService.makeAuthenticatedRequest.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonAddonApiClient.refreshModelStats();

      // Assert
      expect(pythonAddonService.makeAuthenticatedRequest).toHaveBeenCalledWith('/db_manager/models/stats/aa/refresh');
      expect(result).toEqual(mockResponse);
      expect(console.log).toHaveBeenCalledWith('Calling Python addon API to refresh model statistics...');
      expect(console.log).toHaveBeenCalledWith('Model statistics refresh successful');
    });

    it('should throw error when API returns non-success status', async () => {
      // Arrange
      const mockResponse = {
        status: 'error',
        message: 'Database connection failed'
      };
      pythonAddonService.makeAuthenticatedRequest.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(pythonAddonApiClient.refreshModelStats()).rejects.toThrow('Error refreshing model statistics: Failed to refresh model statistics: Database connection failed');
      expect(console.error).toHaveBeenCalledWith('Error refreshing model statistics:', 'Failed to refresh model statistics: Database connection failed');
    });

    it('should throw error when API returns non-success status without message', async () => {
      // Arrange
      const mockResponse = {
        status: 'error'
      };
      pythonAddonService.makeAuthenticatedRequest.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(pythonAddonApiClient.refreshModelStats()).rejects.toThrow('Error refreshing model statistics: Failed to refresh model statistics: Unknown error');
    });

    it('should handle API call errors', async () => {
      // Arrange
      const mockError = new Error('Network error');
      pythonAddonService.makeAuthenticatedRequest.mockRejectedValue(mockError);

      // Act & Assert
      await expect(pythonAddonApiClient.refreshModelStats()).rejects.toThrow('Error refreshing model statistics: Network error');
      expect(console.error).toHaveBeenCalledWith('Error refreshing model statistics:', 'Network error');
    });
  });

  describe('refreshModelRelationships', () => {
    it('should successfully refresh model relationships', async () => {
      // Arrange
      const mockResponse = {
        status: 'success',
        message: 'Model relationships refreshed successfully'
      };
      pythonAddonService.makeAuthenticatedRequest.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonAddonApiClient.refreshModelRelationships();

      // Assert
      expect(pythonAddonService.makeAuthenticatedRequest).toHaveBeenCalledWith('/db_manager/models/refresh_relations_aa');
      expect(result).toEqual(mockResponse);
      expect(console.log).toHaveBeenCalledWith('Calling Python addon API to refresh model relationships...');
      expect(console.log).toHaveBeenCalledWith('Model relationships refresh successful');
    });

    it('should throw error when API returns non-success status', async () => {
      // Arrange
      const mockResponse = {
        status: 'error',
        message: 'Table not found'
      };
      pythonAddonService.makeAuthenticatedRequest.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(pythonAddonApiClient.refreshModelRelationships()).rejects.toThrow('Error refreshing model relationships: Failed to refresh model relationships: Table not found');
      expect(console.error).toHaveBeenCalledWith('Error refreshing model relationships:', 'Failed to refresh model relationships: Table not found');
    });

    it('should throw error when API returns non-success status without message', async () => {
      // Arrange
      const mockResponse = {
        status: 'error'
      };
      pythonAddonService.makeAuthenticatedRequest.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(pythonAddonApiClient.refreshModelRelationships()).rejects.toThrow('Error refreshing model relationships: Failed to refresh model relationships: Unknown error');
    });

    it('should handle API call errors', async () => {
      // Arrange
      const mockError = new Error('Authentication failed');
      pythonAddonService.makeAuthenticatedRequest.mockRejectedValue(mockError);

      // Act & Assert
      await expect(pythonAddonApiClient.refreshModelRelationships()).rejects.toThrow('Error refreshing model relationships: Authentication failed');
      expect(console.error).toHaveBeenCalledWith('Error refreshing model relationships:', 'Authentication failed');
    });
  });

  describe('updatePriceScores', () => {
    it('should successfully update price scores', async () => {
      // Arrange
      const mockResponse = {
        status: 'success',
        message: 'Price scores updated successfully'
      };
      pythonAddonService.makeAuthenticatedRequest.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonAddonApiClient.updatePriceScores();

      // Assert
      expect(pythonAddonService.makeAuthenticatedRequest).toHaveBeenCalledWith('/db_manager/models/update_price_score_from_aa');
      expect(result).toEqual(mockResponse);
      expect(console.log).toHaveBeenCalledWith('Calling Python addon API to update price scores...');
      expect(console.log).toHaveBeenCalledWith('Price scores update successful');
    });

    it('should throw error when API returns non-success status', async () => {
      // Arrange
      const mockResponse = {
        status: 'error',
        message: 'Invalid data format'
      };
      pythonAddonService.makeAuthenticatedRequest.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(pythonAddonApiClient.updatePriceScores()).rejects.toThrow('Error updating price scores: Failed to update price scores: Invalid data format');
      expect(console.error).toHaveBeenCalledWith('Error updating price scores:', 'Failed to update price scores: Invalid data format');
    });

    it('should throw error when API returns non-success status without message', async () => {
      // Arrange
      const mockResponse = {
        status: 'error'
      };
      pythonAddonService.makeAuthenticatedRequest.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(pythonAddonApiClient.updatePriceScores()).rejects.toThrow('Error updating price scores: Failed to update price scores: Unknown error');
    });

    it('should handle API call errors', async () => {
      // Arrange
      const mockError = new Error('Timeout error');
      pythonAddonService.makeAuthenticatedRequest.mockRejectedValue(mockError);

      // Act & Assert
      await expect(pythonAddonApiClient.updatePriceScores()).rejects.toThrow('Error updating price scores: Timeout error');
      expect(console.error).toHaveBeenCalledWith('Error updating price scores:', 'Timeout error');
    });
  });
});