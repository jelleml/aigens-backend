const db = require('../../database');
const { sequelize } = db;
const { Model } = sequelize.models;

// List of all expected table names (as actually created in the DB)
const EXPECTED_TABLES = [
    'users',
    'models',
    'chats',
    'messages',
    'attachments',
    'message_costs',
    'folders',
    'leads',
    'prompts',
    'settings',
    'tokens',
    'transactions',
    'user_accesses',
    'wallets',
    'folder_attachments',
    'folder_chats',
    'user_chats',
];

describe('Database Initialization', () => {
    beforeAll(async () => {
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    test('All Sequelize models exist as tables in the database', async () => {
        const [results] = await sequelize.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`
        );
        const tableNames = results.map(row => row.table_name);
        for (const expectedTable of EXPECTED_TABLES) {
            expect(tableNames).toContain(expectedTable);
        }
    });

    test('The Model table is populated', async () => {
        const count = await Model.count();
        expect(count).toBeGreaterThan(0);
    });
}); 