/**
 * Global teardown for Jest tests
 * Runs once after all tests
 */

const { getLogger } = require('../../services/logging');
const logger = getLogger('global-teardown', 'test');

module.exports = async () => {
  logger.info('\n🧹 Cleaning up test environment...');
  
  // Clean up any test resources
  try {
    // Close any open database connections
    const db = require('../../database');
    if (db && typeof db.close === 'function') {
      await db.close();
    }
    
    // Clean up any temporary files
    const fs = require('fs').promises;
    const path = require('path');
    const tempDir = path.join(__dirname, '../../temp');
    
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        if (file.startsWith('test-')) {
          await fs.unlink(path.join(tempDir, file));
        }
      }
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
    
    logger.info('✅ Test environment cleanup complete');
  } catch (error) {
    logger.error('❌ Error during test environment cleanup:', error);
  }
};