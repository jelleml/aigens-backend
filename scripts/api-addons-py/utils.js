/**
 * Utility functions for model stats update operations
 * Provides verification, timing, and logging functionality
 */

// Import models directly to make mocking easier in tests
const db = require('../../database');
const models = db.sequelize.models;

/**
 * Verification functions for each operation
 */
const verification = {
  /**
   * Verify that model stats data was fetched successfully
   * @param {Array} data - Array of model stats from API
   * @returns {boolean} - True if data is valid
   */
  verifyDataFetch(data) {
    if (!Array.isArray(data)) {
      console.error('Data fetch verification failed: Data is not an array');
      return false;
    }
    
    if (data.length === 0) {
      console.warn('Data fetch verification: No data received');
      return true; // Empty array is valid, just no data available
    }
    
    // Check if first item has required fields
    const firstItem = data[0];
    const requiredFields = ['slug'];
    
    for (const field of requiredFields) {
      if (!firstItem.hasOwnProperty(field)) {
        console.error(`Data fetch verification failed: Missing required field '${field}'`);
        return false;
      }
    }
    
    console.log(`Data fetch verification passed: ${data.length} records received`);
    return true;
  },

  /**
   * Verify that model stats were stored successfully in database
   * @param {Array} slugs - Array of model slugs that should be stored
   * @returns {Promise<boolean>} - True if all records were stored
   */
  async verifyDataStorage(slugs) {
    try {
      if (!Array.isArray(slugs) || slugs.length === 0) {
        console.log('Data storage verification: No slugs to verify');
        return true;
      }
      
      const { ModelStatsAA } = models;
      if (!ModelStatsAA) {
        console.error('Data storage verification failed: ModelStatsAA model not available');
        return false;
      }
      
      const storedRecords = await ModelStatsAA.findAll({
        where: {
          slug: slugs
        },
        attributes: ['slug']
      });
      
      const storedSlugs = storedRecords.map(record => record.slug);
      const missingSlugs = slugs.filter(slug => !storedSlugs.includes(slug));
      
      if (missingSlugs.length > 0) {
        console.error(`Data storage verification failed: Missing slugs: ${missingSlugs.join(', ')}`);
        return false;
      }
      
      console.log(`Data storage verification passed: ${storedSlugs.length}/${slugs.length} records stored`);
      return true;
    } catch (error) {
      console.error('Data storage verification error:', error.message);
      return false;
    }
  },

  /**
   * Verify that model associations were created successfully
   * @param {Array} expectedAssociations - Array of expected associations {modelSlug, statsSlug}
   * @returns {Promise<boolean>} - True if all associations exist
   */
  async verifyAssociations(expectedAssociations) {
    try {
      if (!Array.isArray(expectedAssociations) || expectedAssociations.length === 0) {
        console.log('Association verification: No associations to verify');
        return true;
      }
      
      const { Model, ModelStatsAA, ModelModelStatsAA } = models;
      if (!Model || !ModelStatsAA || !ModelModelStatsAA) {
        console.error('Association verification failed: Required models not available');
        return false;
      }
      
      let verifiedCount = 0;
      
      for (const association of expectedAssociations) {
        const { modelSlug, statsSlug } = association;
        
        // Find the model and stats records
        const model = await Model.findOne({ where: { slug: modelSlug } });
        const stats = await ModelStatsAA.findOne({ where: { slug: statsSlug } });
        
        if (!model || !stats) {
          console.error(`Association verification failed: Model or stats not found for ${modelSlug} -> ${statsSlug}`);
          continue;
        }
        
        // Check if association exists
        const associationExists = await ModelModelStatsAA.findOne({
          where: {
            id_model: model.id,
            id_model_aa: stats.id
          }
        });
        
        if (associationExists) {
          verifiedCount++;
        } else {
          console.error(`Association verification failed: Missing association ${modelSlug} -> ${statsSlug}`);
        }
      }
      
      const success = verifiedCount === expectedAssociations.length;
      console.log(`Association verification: ${verifiedCount}/${expectedAssociations.length} associations verified`);
      return success;
    } catch (error) {
      console.error('Association verification error:', error.message);
      return false;
    }
  },

  /**
   * Verify overall operation success
   * @param {Object} operationResults - Results from the update operation
   * @returns {boolean} - True if operation was successful
   */
  verifyOperation(operationResults) {
    const { 
      dataFetched = false, 
      dataStored = false, 
      associationsCreated = false,
      errors = []
    } = operationResults;
    
    if (errors.length > 0) {
      console.error(`Operation verification failed: ${errors.length} errors occurred`);
      errors.forEach(error => console.error('- Error:', error));
      return false;
    }
    
    if (!dataFetched) {
      console.error('Operation verification failed: Data was not fetched');
      return false;
    }
    
    if (!dataStored) {
      console.error('Operation verification failed: Data was not stored');
      return false;
    }
    
    if (!associationsCreated) {
      console.error('Operation verification failed: Associations were not created');
      return false;
    }
    
    console.log('Operation verification passed: All steps completed successfully');
    return true;
  }
};

/**
 * Wait function for delays between operations
 * @param {number} milliseconds - Number of milliseconds to wait
 * @returns {Promise<void>}
 */
function wait(milliseconds) {
  if (typeof milliseconds !== 'number' || milliseconds < 0) {
    throw new Error('Wait duration must be a non-negative number');
  }
  
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Logging functions for progress and results
 */
const logger = {
  /**
   * Log operation start
   * @param {string} operation - Name of the operation
   */
  logStart(operation) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Starting operation: ${operation}`);
  },

  /**
   * Log operation progress
   * @param {string} operation - Name of the operation
   * @param {string} message - Progress message
   * @param {Object} data - Optional data to log
   */
  logProgress(operation, message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${operation}: ${message}`);
    if (data) {
      console.log('Data:', JSON.stringify(data, null, 2));
    }
  },

  /**
   * Log operation completion
   * @param {string} operation - Name of the operation
   * @param {boolean} success - Whether operation was successful
   * @param {Object} results - Operation results
   */
  logComplete(operation, success, results = null) {
    const timestamp = new Date().toISOString();
    const status = success ? 'COMPLETED' : 'FAILED';
    console.log(`[${timestamp}] ${operation} ${status}`);
    
    if (results) {
      console.log('Results:', JSON.stringify(results, null, 2));
    }
  },

  /**
   * Log error with context
   * @param {string} operation - Name of the operation
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   */
  logError(operation, error, context = null) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR in ${operation}:`);
    
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    } else {
      console.error('Message:', error);
    }
    
    if (context) {
      console.error('Context:', JSON.stringify(context, null, 2));
    }
  },

  /**
   * Log summary of operation results
   * @param {Object} summary - Summary object with counts and metrics
   */
  logSummary(summary) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] OPERATION SUMMARY:`);
    console.log('================================');
    
    Object.entries(summary).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
    
    console.log('================================');
  }
};

module.exports = {
  verification,
  wait,
  logger
};