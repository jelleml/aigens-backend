/**
 * Integration tests for the model statistics update script
 */

// Mock dependencies
jest.mock('../../scripts/api-addons-py/python-addon-api-client', () => ({
  refreshModelStats: jest.fn(),
  refreshModelRelationships: jest.fn(),
  updatePriceScores: jest.fn()
}));

jest.mock('../../scripts/api-addons-py/utils', () => {
  const originalUtils = jest.requireActual('../../scripts/api-addons-py/utils');
  return {
    verification: {
      ...originalUtils.verification,
      verifyOperation: jest.fn()
    },
    wait: jest.fn(() => Promise.resolve()),
    logger: {
      logStart: jest.fn(),
      logProgress: jest.fn(),
      logComplete: jest.fn(),
      logError: jest.fn(),
      logSummary: jest.fn()
    }
  };
});

jest.mock('../../database', () => ({
  authenticate: jest.fn(() => Promise.resolve()),
  close: jest.fn(() => Promise.resolve()),
  models: {
    Model: {
      findAll: jest.fn(() => Promise.resolve([]))
    },
    ModelStatsAA: {
      findAll: jest.fn(() => Promise.resolve([]))
    }
  }
}));

// Import dependencies after mocking
const pythonAddonClient = require('../../scripts/api-addons-py/python-addon-api-client');
const { verification, wait, logger } = require('../../scripts/api-addons-py/utils');
const db = require('../../database');
const { 
  updateModelStats, 
  executeWithRetry, 
  CONFIG 
} = require('../../scripts/update-model-stats-aa-and-relations');

// Save original process.exit and mock it
const originalExit = process.exit;
process.exit = jest.fn();

describe('Model Statistics Update Script', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default successful responses
    pythonAddonClient.refreshModelStats.mockResolvedValue({ status: 'success', data: [] });
    pythonAddonClient.refreshModelRelationships.mockResolvedValue({ status: 'success', data: [] });
    pythonAddonClient.updatePriceScores.mockResolvedValue({ status: 'success', data: [] });
    
    verification.verifyOperation.mockReturnValue(true);
    
    // Override CONFIG for faster tests
    CONFIG.operationDelay = 10;
    CONFIG.retryDelay = 10;
  });
  
  // Restore process.exit after all tests
  afterAll(() => {
    process.exit = originalExit;
  });
  
  test('should successfully complete all operations', async () => {
    const results = await updateModelStats();
    
    // Check that all operations were called
    expect(pythonAddonClient.refreshModelStats).toHaveBeenCalledTimes(1);
    expect(pythonAddonClient.refreshModelRelationships).toHaveBeenCalledTimes(1);
    expect(pythonAddonClient.updatePriceScores).toHaveBeenCalledTimes(1);
    
    // Check database connection was established and closed
    expect(db.authenticate).toHaveBeenCalledTimes(1);
    expect(db.close).toHaveBeenCalledTimes(1);
    
    // Check verification was called
    expect(verification.verifyOperation).toHaveBeenCalledTimes(1);
    
    // Check wait was called between operations
    expect(wait).toHaveBeenCalledTimes(2);
    
    // Check results structure
    expect(results.operations.refreshStats.success).toBe(true);
    expect(results.operations.refreshRelationships.success).toBe(true);
    expect(results.operations.updatePriceScores.success).toBe(true);
    expect(results.summary.successfulOperations).toBe(3);
    expect(results.summary.failedOperations).toBe(0);
    
    // Check process.exit was not called (successful execution)
    expect(process.exit).not.toHaveBeenCalled();
  });
  
  test('should handle failure in refreshModelStats operation', async () => {
    // Mock failure in first operation
    const mockError = new Error('API error');
    pythonAddonClient.refreshModelStats.mockRejectedValue(mockError);
    
    // Mock verification to return false
    verification.verifyOperation.mockReturnValue(false);
    
    const results = await updateModelStats();
    
    // Check that first operation was attempted CONFIG.maxRetries times
    expect(pythonAddonClient.refreshModelStats).toHaveBeenCalledTimes(CONFIG.maxRetries);
    
    // Check that subsequent operations were not called
    expect(pythonAddonClient.refreshModelRelationships).not.toHaveBeenCalled();
    expect(pythonAddonClient.updatePriceScores).not.toHaveBeenCalled();
    
    // Check error was logged
    expect(logger.logError).toHaveBeenCalled();
    
    // Check results structure
    expect(results.operations.refreshStats.success).toBe(false);
    expect(results.operations.refreshStats.errors.length).toBeGreaterThan(0);
    expect(results.summary.successfulOperations).toBe(0);
    expect(results.summary.failedOperations).toBe(3);
    
    // Check process.exit was called with error code
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  
  test('should handle failure in refreshModelRelationships operation', async () => {
    // Mock success in first operation but failure in second
    pythonAddonClient.refreshModelRelationships.mockRejectedValue(new Error('API error'));
    
    // Mock verification to return false
    verification.verifyOperation.mockReturnValue(false);
    
    const results = await updateModelStats();
    
    // Check that first operation was called once
    expect(pythonAddonClient.refreshModelStats).toHaveBeenCalledTimes(1);
    
    // Check that second operation was attempted CONFIG.maxRetries times
    expect(pythonAddonClient.refreshModelRelationships).toHaveBeenCalledTimes(CONFIG.maxRetries);
    
    // Check that third operation was not called
    expect(pythonAddonClient.updatePriceScores).not.toHaveBeenCalled();
    
    // Check error was logged
    expect(logger.logError).toHaveBeenCalled();
    
    // Check results structure
    expect(results.operations.refreshStats.success).toBe(true);
    expect(results.operations.refreshRelationships.success).toBe(false);
    expect(results.operations.refreshRelationships.errors.length).toBeGreaterThan(0);
    expect(results.summary.successfulOperations).toBe(1);
    expect(results.summary.failedOperations).toBe(2);
    
    // Check process.exit was called with error code
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  
  test('should handle database connection failure', async () => {
    // Mock database connection failure
    db.authenticate.mockRejectedValue(new Error('Database connection error'));
    
    await expect(updateModelStats()).rejects.toThrow('Database connection failed');
    
    // Check that no operations were called
    expect(pythonAddonClient.refreshModelStats).not.toHaveBeenCalled();
    expect(pythonAddonClient.refreshModelRelationships).not.toHaveBeenCalled();
    expect(pythonAddonClient.updatePriceScores).not.toHaveBeenCalled();
    
    // Check error was logged
    expect(logger.logError).toHaveBeenCalled();
  });
  
  test('executeWithRetry should retry failed operations', async () => {
    const mockOperation = jest.fn();
    mockOperation
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockRejectedValueOnce(new Error('Second attempt failed'))
      .mockResolvedValueOnce('Success on third attempt');
    
    const errorList = [];
    
    const result = await executeWithRetry('Test Operation', mockOperation, errorList);
    
    // Check that operation was called 3 times
    expect(mockOperation).toHaveBeenCalledTimes(3);
    
    // Check that errors were collected
    expect(errorList.length).toBe(2);
    expect(errorList[0]).toBe('First attempt failed');
    expect(errorList[1]).toBe('Second attempt failed');
    
    // Check that wait was called between retries
    expect(wait).toHaveBeenCalledTimes(2);
    
    // Check result
    expect(result).toBe('Success on third attempt');
  });
  
  test('executeWithRetry should throw after max retries', async () => {
    const mockOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
    const errorList = [];
    
    await expect(executeWithRetry('Test Operation', mockOperation, errorList))
      .rejects.toThrow('Operation failed');
    
    // Check that operation was called CONFIG.maxRetries times
    expect(mockOperation).toHaveBeenCalledTimes(CONFIG.maxRetries);
    
    // Check that errors were collected
    expect(errorList.length).toBe(CONFIG.maxRetries);
    
    // Check that wait was called between retries
    expect(wait).toHaveBeenCalledTimes(CONFIG.maxRetries - 1);
  });
});