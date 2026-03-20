/**
 * Unit tests for utility functions
 */

// Create mock models
const mockModelStatsAA = {
  findAll: jest.fn(),
  findOne: jest.fn()
};

const mockModel = {
  findOne: jest.fn()
};

const mockModelModelStatsAA = {
  findOne: jest.fn()
};

// Mock the database models module
jest.mock('../../database/models', () => ({
  ModelStatsAA: mockModelStatsAA,
  Model: mockModel,
  ModelModelStatsAA: mockModelModelStatsAA
}), { virtual: true });

const { verification, wait, logger } = require('../../scripts/api-addons-py/utils');

describe('Utility Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('verification.verifyDataFetch', () => {
    it('should return true for valid data array', () => {
      // Arrange
      const mockData = [
        { slug: 'model-1', intelligence_mmlu_pro: 0.85 },
        { slug: 'model-2', intelligence_mmlu_pro: 0.75 }
      ];

      // Act
      const result = verification.verifyDataFetch(mockData);

      // Assert
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Data fetch verification passed'));
    });

    it('should return true for empty array', () => {
      // Arrange
      const mockData = [];

      // Act
      const result = verification.verifyDataFetch(mockData);

      // Assert
      expect(result).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No data received'));
    });

    it('should return false for non-array data', () => {
      // Arrange
      const mockData = { results: [] };

      // Act
      const result = verification.verifyDataFetch(mockData);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Data is not an array'));
    });

    it('should return false when required fields are missing', () => {
      // Arrange
      const mockData = [{ name: 'model-1' }]; // Missing slug field

      // Act
      const result = verification.verifyDataFetch(mockData);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Missing required field 'slug'"));
    });
  });

  describe('verification.verifyDataStorage', () => {
    it('should return true when all records are stored', async () => {
      // Arrange
      const slugs = ['model-1', 'model-2'];
      mockModelStatsAA.findAll.mockResolvedValue([
        { slug: 'model-1' },
        { slug: 'model-2' }
      ]);

      // Act
      const result = await verification.verifyDataStorage(slugs);

      // Assert
      expect(result).toBe(true);
      expect(mockModelStatsAA.findAll).toHaveBeenCalledWith({
        where: { slug: slugs },
        attributes: ['slug']
      });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Data storage verification passed'));
    });

    it('should return true for empty slugs array', async () => {
      // Arrange
      const slugs = [];

      // Act
      const result = await verification.verifyDataStorage(slugs);

      // Assert
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No slugs to verify'));
    });

    it('should return false when some records are missing', async () => {
      // Arrange
      const slugs = ['model-1', 'model-2', 'model-3'];
      mockModelStatsAA.findAll.mockResolvedValue([
        { slug: 'model-1' },
        { slug: 'model-3' }
      ]);

      // Act
      const result = await verification.verifyDataStorage(slugs);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Missing slugs: model-2'));
    });

    it('should return false when database query fails', async () => {
      // Arrange
      const slugs = ['model-1', 'model-2'];
      mockModelStatsAA.findAll.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await verification.verifyDataStorage(slugs);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Data storage verification error:', 'Database error');
    });
  });

  describe('verification.verifyAssociations', () => {
    it('should return true when all associations exist', async () => {
      // Arrange
      const expectedAssociations = [
        { modelSlug: 'model-1', statsSlug: 'stats-1' },
        { modelSlug: 'model-2', statsSlug: 'stats-2' }
      ];
      
      // Mock model and stats lookups
      mockModel.findOne.mockImplementation(({ where }) => {
        if (where.slug === 'model-1') return Promise.resolve({ id: 'm1' });
        if (where.slug === 'model-2') return Promise.resolve({ id: 'm2' });
        return Promise.resolve(null);
      });
      
      mockModelStatsAA.findOne.mockImplementation(({ where }) => {
        if (where.slug === 'stats-1') return Promise.resolve({ id: 's1' });
        if (where.slug === 'stats-2') return Promise.resolve({ id: 's2' });
        return Promise.resolve(null);
      });
      
      // Mock association lookups
      mockModelModelStatsAA.findOne.mockResolvedValue({ id: 'assoc1' });

      // Act
      const result = await verification.verifyAssociations(expectedAssociations);

      // Assert
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2/2 associations verified'));
    });

    it('should return true for empty associations array', async () => {
      // Arrange
      const expectedAssociations = [];

      // Act
      const result = await verification.verifyAssociations(expectedAssociations);

      // Assert
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No associations to verify'));
    });

    it('should return false when some associations are missing', async () => {
      // Arrange
      const expectedAssociations = [
        { modelSlug: 'model-1', statsSlug: 'stats-1' },
        { modelSlug: 'model-2', statsSlug: 'stats-2' }
      ];
      
      // Mock model and stats lookups
      mockModel.findOne.mockImplementation(({ where }) => {
        if (where.slug === 'model-1') return Promise.resolve({ id: 'm1' });
        if (where.slug === 'model-2') return Promise.resolve({ id: 'm2' });
        return Promise.resolve(null);
      });
      
      mockModelStatsAA.findOne.mockImplementation(({ where }) => {
        if (where.slug === 'stats-1') return Promise.resolve({ id: 's1' });
        if (where.slug === 'stats-2') return Promise.resolve({ id: 's2' });
        return Promise.resolve(null);
      });
      
      // Mock association lookups - only first one exists
      mockModelModelStatsAA.findOne.mockImplementation(({ where }) => {
        if (where.id_model === 'm1' && where.id_model_aa === 's1') {
          return Promise.resolve({ id: 'assoc1' });
        }
        return Promise.resolve(null);
      });

      // Act
      const result = await verification.verifyAssociations(expectedAssociations);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Missing association model-2 -> stats-2'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('1/2 associations verified'));
    });

    it('should handle missing models or stats', async () => {
      // Arrange
      const expectedAssociations = [
        { modelSlug: 'model-1', statsSlug: 'stats-1' },
        { modelSlug: 'missing-model', statsSlug: 'stats-2' }
      ];
      
      // Mock model and stats lookups
      mockModel.findOne.mockImplementation(({ where }) => {
        if (where.slug === 'model-1') return Promise.resolve({ id: 'm1' });
        return Promise.resolve(null); // missing-model returns null
      });
      
      mockModelStatsAA.findOne.mockImplementation(({ where }) => {
        if (where.slug === 'stats-1') return Promise.resolve({ id: 's1' });
        if (where.slug === 'stats-2') return Promise.resolve({ id: 's2' });
        return Promise.resolve(null);
      });
      
      // Mock association lookups
      mockModelModelStatsAA.findOne.mockResolvedValue({ id: 'assoc1' });

      // Act
      const result = await verification.verifyAssociations(expectedAssociations);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Model or stats not found for missing-model -> stats-2'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('1/2 associations verified'));
    });

    it('should return false when database query fails', async () => {
      // Arrange
      const expectedAssociations = [
        { modelSlug: 'model-1', statsSlug: 'stats-1' }
      ];
      
      // Mock database error
      mockModel.findOne.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await verification.verifyAssociations(expectedAssociations);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Association verification error:', 'Database error');
    });
  });

  describe('verification.verifyOperation', () => {
    it('should return true when all operations succeeded', () => {
      // Arrange
      const operationResults = {
        dataFetched: true,
        dataStored: true,
        associationsCreated: true,
        errors: []
      };

      // Act
      const result = verification.verifyOperation(operationResults);

      // Assert
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Operation verification passed'));
    });

    it('should return false when errors occurred', () => {
      // Arrange
      const operationResults = {
        dataFetched: true,
        dataStored: true,
        associationsCreated: true,
        errors: ['API error', 'Database error']
      };

      // Act
      const result = verification.verifyOperation(operationResults);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('2 errors occurred'));
    });

    it('should return false when data was not fetched', () => {
      // Arrange
      const operationResults = {
        dataFetched: false,
        dataStored: true,
        associationsCreated: true,
        errors: []
      };

      // Act
      const result = verification.verifyOperation(operationResults);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Data was not fetched'));
    });

    it('should return false when data was not stored', () => {
      // Arrange
      const operationResults = {
        dataFetched: true,
        dataStored: false,
        associationsCreated: true,
        errors: []
      };

      // Act
      const result = verification.verifyOperation(operationResults);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Data was not stored'));
    });

    it('should return false when associations were not created', () => {
      // Arrange
      const operationResults = {
        dataFetched: true,
        dataStored: true,
        associationsCreated: false,
        errors: []
      };

      // Act
      const result = verification.verifyOperation(operationResults);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Associations were not created'));
    });

    it('should handle missing fields in operation results', () => {
      // Arrange
      const operationResults = {
        // Missing fields
      };

      // Act
      const result = verification.verifyOperation(operationResults);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Data was not fetched'));
    });
  });

  describe('wait function', () => {
    it('should wait for the specified duration', async () => {
      // Arrange
      jest.useFakeTimers();
      const waitPromise = wait(1000);
      
      // Act
      jest.advanceTimersByTime(1000);
      
      // Assert
      await expect(waitPromise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
    
    it('should wait for a short duration', async () => {
      // Arrange
      jest.useFakeTimers();
      const waitPromise = wait(100);
      
      // Act
      jest.advanceTimersByTime(100);
      
      // Assert
      await expect(waitPromise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
    
    it('should wait for a long duration', async () => {
      // Arrange
      jest.useFakeTimers();
      const waitPromise = wait(5000);
      
      // Act
      jest.advanceTimersByTime(5000);
      
      // Assert
      await expect(waitPromise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
    
    it('should wait for zero duration', async () => {
      // Arrange
      jest.useFakeTimers();
      const waitPromise = wait(0);
      
      // Act
      jest.advanceTimersByTime(0);
      
      // Assert
      await expect(waitPromise).resolves.toBeUndefined();
      jest.useRealTimers();
    });

    it('should throw error for negative duration', async () => {
      // Act & Assert
      expect(() => wait(-100)).toThrow('Wait duration must be a non-negative number');
    });

    it('should throw error for non-numeric duration', async () => {
      // Act & Assert
      expect(() => wait('1000')).toThrow('Wait duration must be a non-negative number');
    });
  });

  describe('logger functions', () => {
    it('should log operation start', () => {
      // Act
      logger.logStart('TestOperation');
      
      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] Starting operation: TestOperation/));
    });

    it('should log operation progress', () => {
      // Act
      logger.logProgress('TestOperation', 'Step 1 completed');
      
      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] TestOperation: Step 1 completed/));
    });

    it('should log operation progress with data', () => {
      // Arrange
      const data = { count: 5, status: 'processing' };
      
      // Act
      logger.logProgress('TestOperation', 'Processing items', data);
      
      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] TestOperation: Processing items/));
      expect(console.log).toHaveBeenCalledWith('Data:', JSON.stringify(data, null, 2));
    });

    it('should log operation completion with success', () => {
      // Act
      logger.logComplete('TestOperation', true);
      
      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] TestOperation COMPLETED/));
    });

    it('should log operation completion with failure', () => {
      // Act
      logger.logComplete('TestOperation', false);
      
      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] TestOperation FAILED/));
    });

    it('should log operation completion with results', () => {
      // Arrange
      const results = { processed: 10, errors: 2 };
      
      // Act
      logger.logComplete('TestOperation', true, results);
      
      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] TestOperation COMPLETED/));
      expect(console.log).toHaveBeenCalledWith('Results:', JSON.stringify(results, null, 2));
    });

    it('should log error with Error object', () => {
      // Arrange
      const error = new Error('Something went wrong');
      
      // Act
      logger.logError('TestOperation', error);
      
      // Assert
      expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] ERROR in TestOperation:/));
      expect(console.error).toHaveBeenCalledWith('Message:', 'Something went wrong');
      expect(console.error).toHaveBeenCalledWith('Stack:', error.stack);
    });

    it('should log error with string message', () => {
      // Act
      logger.logError('TestOperation', 'Something went wrong');
      
      // Assert
      expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] ERROR in TestOperation:/));
      expect(console.error).toHaveBeenCalledWith('Message:', 'Something went wrong');
    });

    it('should log error with context', () => {
      // Arrange
      const error = 'Database connection failed';
      const context = { attempt: 3, timeout: 5000 };
      
      // Act
      logger.logError('TestOperation', error, context);
      
      // Assert
      expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] ERROR in TestOperation:/));
      expect(console.error).toHaveBeenCalledWith('Message:', 'Database connection failed');
      expect(console.error).toHaveBeenCalledWith('Context:', JSON.stringify(context, null, 2));
    });

    it('should log summary', () => {
      // Arrange
      const summary = {
        'Total models processed': 25,
        'Models updated': 20,
        'Models skipped': 5,
        'Execution time': '2.5s'
      };
      
      // Act
      logger.logSummary(summary);
      
      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] OPERATION SUMMARY:/));
      expect(console.log).toHaveBeenCalledWith('================================');
      expect(console.log).toHaveBeenCalledWith('Total models processed: 25');
      expect(console.log).toHaveBeenCalledWith('Models updated: 20');
      expect(console.log).toHaveBeenCalledWith('Models skipped: 5');
      expect(console.log).toHaveBeenCalledWith('Execution time: 2.5s');
      expect(console.log).toHaveBeenCalledWith('================================');
    });
  });
});