require('dotenv').config();
const { Sequelize } = require('sequelize');
const config = require('./config/database');

// Create Sequelize instance
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  config
);

async function fixForeignKeyConstraint() {
  try {
    console.log('Starting foreign key constraint fix...');
    
    // Find all chats with id_last_model_used values that don't exist in models table
    const [invalidChats] = await sequelize.query(`
      SELECT c.id, c.id_last_model_used 
      FROM chats c 
      LEFT JOIN models m ON c.id_last_model_used = m.id 
      WHERE c.id_last_model_used IS NOT NULL 
      AND m.id IS NULL
    `);
    
    console.log(`Found ${invalidChats.length} chats with invalid model references`);
    
    if (invalidChats.length > 0) {
      // Set invalid references to NULL
      const chatIds = invalidChats.map(chat => chat.id);
      await sequelize.query(`
        UPDATE chats 
        SET id_last_model_used = NULL 
        WHERE id IN (${chatIds.join(',')})
      `);
      
      console.log(`Updated ${chatIds.length} chats to have NULL id_last_model_used`);
    }
    
    // Now try to add the foreign key constraint
    console.log('Adding foreign key constraint...');
    await sequelize.query(`
      ALTER TABLE chats 
      ADD CONSTRAINT fk_chats_last_model 
      FOREIGN KEY (id_last_model_used) 
      REFERENCES models (id)
    `);
    
    console.log('Foreign key constraint added successfully!');
  } catch (error) {
    console.error('Error fixing foreign key constraint:', error);
  } finally {
    await sequelize.close();
  }
}

fixForeignKeyConstraint();