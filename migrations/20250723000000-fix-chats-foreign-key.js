'use strict';

/** @type {import('sequelize-cli').Migration} */
const { getLogger } = require('../services/logging');
const logger = getLogger('fix-chats-foreign-key', 'migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    // First, find all chats with id_last_model_used values that don't exist in models table
    const [invalidChats] = await queryInterface.sequelize.query(`
      SELECT c.id, c.id_last_model_used 
      FROM chats c 
      LEFT JOIN models m ON c.id_last_model_used = m.id 
      WHERE c.id_last_model_used IS NOT NULL 
      AND m.id IS NULL
    `);
    
    logger.info(`Found ${invalidChats.length} chats with invalid model references`);
    
    if (invalidChats.length > 0) {
      // Set invalid references to NULL
      const chatIds = invalidChats.map(chat => chat.id);
      await queryInterface.sequelize.query(`
        UPDATE chats 
        SET id_last_model_used = NULL 
        WHERE id IN (${chatIds.join(',')})
      `);
      
      logger.info(`Updated ${chatIds.length} chats to have NULL id_last_model_used`);
    }
    
    // Check if the foreign key already exists
    const [foreignKeys] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_NAME = 'chats'
      AND COLUMN_NAME = 'id_last_model_used'
      AND REFERENCED_TABLE_NAME = 'models'
      AND CONSTRAINT_SCHEMA = DATABASE()
    `);
    
    // If the foreign key doesn't exist, add it
    if (foreignKeys.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE chats 
        ADD CONSTRAINT fk_chats_last_model 
        FOREIGN KEY (id_last_model_used) 
        REFERENCES models (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
      `);
      
      logger.info('Foreign key constraint added successfully!');
    } else {
      logger.info('Foreign key constraint already exists');
    }
  },

  async down(queryInterface, Sequelize) {
    // Check if the foreign key exists
    const [foreignKeys] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_NAME = 'chats'
      AND COLUMN_NAME = 'id_last_model_used'
      AND REFERENCED_TABLE_NAME = 'models'
      AND CONSTRAINT_SCHEMA = DATABASE()
    `);
    
    // If the foreign key exists, remove it
    if (foreignKeys.length > 0) {
      const constraintName = foreignKeys[0].CONSTRAINT_NAME;
      await queryInterface.sequelize.query(`
        ALTER TABLE chats 
        DROP FOREIGN KEY ${constraintName}
      `);
      
      logger.info('Foreign key constraint removed successfully!');
    }
  }
};