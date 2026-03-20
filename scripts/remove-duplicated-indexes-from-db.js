#!/usr/bin/env node

const { Sequelize } = require('sequelize');
const config = require('../config/database');
const { getLogger } = require('../services/logging');
const logger = getLogger('remove-duplicated-indexes', 'script');

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

async function findAndRemoveDuplicateIndexes() {
    try {
        await sequelize.authenticate();
        logger.info('Connection has been established successfully.');

        // Get all tables in the database
        const [tables] = await sequelize.query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = '${dbConfig.database}'
        `);

        for (const table of tables) {
            const tableName = table.TABLE_NAME;
            logger.info(`\nAnalyzing table: ${tableName}`);

            // Get all indexes for the table
            const [indexes] = await sequelize.query(`
                SELECT 
                    INDEX_NAME,
                    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
                FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = '${dbConfig.database}'
                AND TABLE_NAME = '${tableName}'
                GROUP BY INDEX_NAME
            `);

            // Find duplicate indexes (same columns, different names)
            const columnGroups = {};
            const duplicates = [];

            for (const index of indexes) {
                const columns = index.columns;
                if (!columnGroups[columns]) {
                    columnGroups[columns] = [];
                }
                columnGroups[columns].push(index.INDEX_NAME);
            }

            // Identify duplicates
            for (const [columns, indexNames] of Object.entries(columnGroups)) {
                if (indexNames.length > 1) {
                    // Keep the first index, mark others as duplicates
                    const [keepIndex, ...duplicateIndexes] = indexNames;
                    duplicates.push({
                        table: tableName,
                        columns,
                        keepIndex,
                        duplicateIndexes
                    });
                }
            }

            // Remove duplicate indexes
            for (const dup of duplicates) {
                logger.info(`\nFound duplicate indexes in ${dup.table}:`);
                logger.info(`Columns: ${dup.columns}`);
                logger.info(`Keeping: ${dup.keepIndex}`);
                logger.info(`Removing: ${dup.duplicateIndexes.join(', ')}`);

                for (const indexName of dup.duplicateIndexes) {
                    try {
                        // Skip PRIMARY index
                        if (indexName === 'PRIMARY') {
                            logger.info(`Skipping PRIMARY index`);
                            continue;
                        }

                        await sequelize.query(`
                            ALTER TABLE \`${dup.table}\` DROP INDEX \`${indexName}\`
                        `);
                        logger.info(`Successfully removed index: ${indexName}`);
                    } catch (err) {
                        logger.error(`Error removing index ${indexName}: ${err.message}`);
                    }
                }
            }
        }

        logger.info('\nDuplicate index removal completed.');
    } catch (error) {
        logger.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

// Run the script
findAndRemoveDuplicateIndexes();