'use strict';

/**
 * DEPRECATED: This script no longer manages table creation or schema sync.
 * Use migrations and the centralized DatabaseManager for all schema management.
 * This script only attempts to fix foreign key/data issues if needed.
 */

const { Sequelize } = require('sequelize');
const config = require('../config/database');
const { getLogger } = require('../services/logging');
const logger = getLogger('fix-migration-issues', 'script');

// Use the environment from NODE_ENV, defaulting to 'development'
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance
const sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
        host: dbConfig.host,
        dialect: dbConfig.dialect,
        logging: false,
    }
);

async function fixMigrationIssues() {
    logger.warn('DEPRECATION NOTICE: Table creation and schema sync are now managed by migrations and the DatabaseManager.');
    logger.warn('This script only attempts to fix foreign key/data issues if needed.');
    try {
        await sequelize.authenticate();
        logger.info('Connection has been established successfully.');

        const dialect = sequelize.getDialect();
        logger.info(`Database dialect: ${dialect}`);

        // Get list of all tables
        let tables = [];
        if (dialect === 'mysql') {
            const [rows] = await sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = '${dbConfig.database}'
      `);
            tables = rows.map(row => row.TABLE_NAME);
        } else if (dialect === 'postgres') {
            const [rows] = await sequelize.query(`
        SELECT tablename 
        FROM pg_catalog.pg_tables 
        WHERE schemaname = 'public'
      `);
            tables = rows.map(row => row.tablename);
        } else {
            logger.error(`Unsupported dialect: ${dialect}`);
            process.exit(1);
        }

        logger.info('Tables:', tables);

        // Check for duplicate tables (users and users_new)
        if (tables.includes('users') && tables.includes('users_new')) {
            logger.warn('Found both users and users_new tables. This indicates a migration issue.');

            // Try to recover by continuing the migration
            // 1. Check if all foreign keys were updated
            const relatedTables = ['wallets', 'chats', 'transactions', 'prompts', 'attachments', 'leads', 'tokens'];

            for (const table of relatedTables) {
                if (!tables.includes(table)) {
                    logger.warn(`Table ${table} does not exist, skipping...`);
                    continue;
                }

                // Check if the table has a user_id column
                try {
                    const tableColumns = await sequelize.query(`DESCRIBE ${table}`, { type: Sequelize.QueryTypes.SELECT });
                    const userIdColumn = tableColumns.find(col => col.Field === 'user_id');

                    if (userIdColumn) {
                        logger.info(`Found user_id column in ${table} with type ${userIdColumn.Type}`);

                        // If type is not UUID, we need to update it
                        if (!userIdColumn.Type.toLowerCase().includes('varchar')) {
                            logger.info(`Table ${table} user_id is not UUID, fixing...`);

                            // Create temporary UUID column
                            await sequelize.query(`ALTER TABLE ${table} ADD COLUMN user_uuid VARCHAR(36) NULL`);

                            // Update the new column with data from users_new
                            await sequelize.query(`
                UPDATE ${table} t
                JOIN users u ON t.user_id = u.id
                JOIN users_new un ON u.email = un.email
                SET t.user_uuid = un.id
              `);

                            // Drop foreign key constraint
                            const foreignKeyResult = await sequelize.query(`
                SELECT CONSTRAINT_NAME 
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                WHERE TABLE_NAME = '${table}' 
                AND COLUMN_NAME = 'user_id'
                AND REFERENCED_TABLE_NAME = 'users'
              `);

                            if (foreignKeyResult[0].length > 0) {
                                const foreignKeyName = foreignKeyResult[0][0].CONSTRAINT_NAME;
                                logger.info(`Dropping foreign key ${foreignKeyName} from ${table}`);
                                await sequelize.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${foreignKeyName}`);
                            }

                            // Drop old column and rename new one
                            await sequelize.query(`ALTER TABLE ${table} DROP COLUMN user_id`);
                            await sequelize.query(`ALTER TABLE ${table} CHANGE user_uuid user_id VARCHAR(36) NULL`);

                            // Add new foreign key constraint
                            await sequelize.query(`
                ALTER TABLE ${table} 
                ADD CONSTRAINT ${table}_user_id_fkey 
                FOREIGN KEY (user_id) 
                REFERENCES users_new(id) 
                ON DELETE NO ACTION 
                ON UPDATE CASCADE
              `);

                            logger.info(`Fixed ${table} user_id column`);
                        }
                    }
                } catch (err) {
                    logger.error(`Error processing table ${table}:`, err.message);
                }
            }

            // 2. Try to drop the old users table
            try {
                logger.info('Attempting to drop the old users table...');
                await sequelize.query('DROP TABLE users');
                logger.info('Successfully dropped users table');
            } catch (err) {
                logger.error('Error dropping users table:', err.message);
                logger.info('Attempting to fix foreign key constraints...');

                // Get all foreign keys referencing users
                const foreignKeys = await sequelize.query(`
          SELECT TABLE_NAME, CONSTRAINT_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE REFERENCED_TABLE_NAME = 'users'
        `);

                for (const fk of foreignKeys[0]) {
                    logger.info(`Dropping foreign key ${fk.CONSTRAINT_NAME} from ${fk.TABLE_NAME}`);
                    try {
                        await sequelize.query(`ALTER TABLE ${fk.TABLE_NAME} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
                    } catch (err) {
                        logger.error(`Error dropping foreign key ${fk.CONSTRAINT_NAME}:`, err.message);
                    }
                }

                // Try dropping the table again
                try {
                    await sequelize.query('DROP TABLE users');
                    logger.info('Successfully dropped users table after removing foreign keys');
                } catch (err) {
                    logger.error('Still unable to drop users table:', err.message);
                }
            }

            // 3. Rename users_new to users
            if (!tables.includes('users') && tables.includes('users_new')) {
                try {
                    logger.info('Renaming users_new to users...');
                    await sequelize.query('RENAME TABLE users_new TO users');
                    logger.info('Successfully renamed users_new to users');
                } catch (err) {
                    logger.error('Error renaming users_new to users:', err.message);
                }
            }

            // 4. Update foreign keys to point to the new users table
            if (tables.includes('users') && !tables.includes('users_new')) {
                for (const table of relatedTables) {
                    if (!tables.includes(table)) continue;

                    try {
                        const tableColumns = await sequelize.query(`DESCRIBE ${table}`, { type: Sequelize.QueryTypes.SELECT });
                        if (tableColumns.find(col => col.Field === 'user_id')) {
                            logger.info(`Adding foreign key constraint to ${table}`);
                            await sequelize.query(`
                ALTER TABLE ${table}
                ADD CONSTRAINT ${table}_user_id_fkey
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE NO ACTION
                ON UPDATE CASCADE
              `);
                        }
                    } catch (err) {
                        logger.error(`Error updating foreign key for ${table}:`, err.message);
                    }
                }
            }
        }

        // Clean up any temporary tables
        if (tables.includes('users_backup')) {
            try {
                logger.info('Dropping users_backup table...');
                await sequelize.query('DROP TABLE users_backup');
                logger.info('Successfully dropped users_backup table');
            } catch (err) {
                logger.error('Error dropping users_backup table:', err.message);
            }
        }

        if (tables.includes('id_mapping')) {
            try {
                logger.info('Dropping id_mapping table...');
                await sequelize.query('DROP TABLE id_mapping');
                logger.info('Successfully dropped id_mapping table');
            } catch (err) {
                logger.error('Error dropping id_mapping table:', err.message);
            }
        }

        logger.info('Migration fix script completed.');
    } catch (error) {
        logger.error('Unable to connect to the database:', error);
    }
}

if (require.main === module) {
    fixMigrationIssues();
} 