const dbManager = require('../database');
const { execSync } = require('child_process');
const { getLogger } = require('../services/logging');
const logger = getLogger('db-manager', 'script');

class DatabaseScripts {
    static async runMigration() {
        try {
            execSync('npx sequelize-cli db:migrate', { stdio: 'inherit' });
            logger.info('Migrations completed successfully.');
        } catch (error) {
            logger.error('Migration failed:', error);
            throw error;
        }
    }

    static async undoLastMigration() {
        try {
            execSync('npx sequelize-cli db:migrate:undo', { stdio: 'inherit' });
            logger.info('Last migration undone successfully.');
        } catch (error) {
            logger.error('Failed to undo migration:', error);
            throw error;
        }
    }

    static async createMigration(name) {
        try {
            execSync(`npx sequelize-cli migration:generate --name ${name}`, { stdio: 'inherit' });
            logger.info(`Migration ${name} created successfully.`);
        } catch (error) {
            logger.error('Failed to create migration:', error);
            throw error;
        }
    }

    static async seedDatabase() {
        try {
            execSync('npx sequelize-cli db:seed:all', { stdio: 'inherit' });
            logger.info('Database seeded successfully.');
        } catch (error) {
            logger.error('Seeding failed:', error);
            throw error;
        }
    }

    static async checkDatabaseHealth() {
        try {
            await dbManager.initialize();
            const requiredTables = [
                'users', 'models', 'chats', 'messages', 'attachments',
                'message_costs', 'folders', 'leads', 'prompts', 'settings',
                'tokens', 'transactions', 'user_accesses', 'wallets',
                'folder_attachments', 'folder_chats', 'user_chats'
            ];
            const missingTables = [];
            for (const table of requiredTables) {
                const [exists] = await dbManager.sequelize.query(`
                    SELECT COUNT(*) as count 
                    FROM information_schema.tables 
                    WHERE table_schema = '${dbManager.sequelize.config.database}' 
                    AND table_name = '${table}'
                `);
                if (exists[0].count === 0) {
                    missingTables.push(table);
                }
            }
            if (missingTables.length > 0) {
                logger.warn('Missing tables:', missingTables);
                return false;
            }
            logger.info('Database health check passed.');
            return true;
        } catch (error) {
            logger.error('Database health check failed:', error);
            return false;
        }
    }
}

module.exports = DatabaseScripts; 