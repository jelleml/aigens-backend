const dbManager = require('../database');

class DatabaseCleanup {
    static async removeDuplicateIndexes() {
        try {
            await dbManager.initialize();
            const [tables] = await dbManager.sequelize.query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = '${dbManager.sequelize.config.database}'
            `);
            for (const table of tables) {
                const tableName = table.TABLE_NAME;
                console.log(`\nAnalyzing table: ${tableName}`);
                const [indexes] = await dbManager.sequelize.query(`
                    SELECT 
                        INDEX_NAME,
                        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
                    FROM INFORMATION_SCHEMA.STATISTICS
                    WHERE TABLE_SCHEMA = '${dbManager.sequelize.config.database}'
                    AND TABLE_NAME = '${tableName}'
                    GROUP BY INDEX_NAME
                `);
                const columnGroups = {};
                for (const index of indexes) {
                    if (index.INDEX_NAME === 'PRIMARY') continue;
                    const key = index.columns;
                    if (!columnGroups[key]) {
                        columnGroups[key] = [];
                    }
                    columnGroups[key].push(index.INDEX_NAME);
                }
                for (const [columns, indexNames] of Object.entries(columnGroups)) {
                    if (indexNames.length > 1) {
                        console.log(`\nFound duplicate indexes in ${tableName}:`);
                        console.log(`Columns: ${columns}`);
                        console.log(`Keeping: ${indexNames[0]}`);
                        console.log(`Removing: ${indexNames.slice(1).join(', ')}`);
                        for (const indexName of indexNames.slice(1)) {
                            try {
                                await dbManager.sequelize.query(`
                                    ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\`
                                `);
                                console.log(`Successfully removed index: ${indexName}`);
                            } catch (err) {
                                console.error(`Error removing index ${indexName}: ${err.message}`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
            throw error;
        }
    }
}

module.exports = DatabaseCleanup; 