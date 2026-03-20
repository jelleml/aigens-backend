const { execSync } = require('child_process');
const db = require('../../database');
const { sequelize } = db;

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

describe('Server restart does not destroy tables', () => {
    beforeAll(async () => {
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    test('Restarting the server does not drop any tables and throws no errors', async () => {
        // Get tables before restart
        const [beforeResults] = await sequelize.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`
        );
        const beforeTables = beforeResults.map(row => row.table_name);

        // Simulate server restart by running `node server.js` and capturing output
        let output = '';
        let error = '';
        try {
            output = execSync('node server.js', { encoding: 'utf8', timeout: 15000 });
        } catch (e) {
            error = e.stdout ? e.stdout.toString() : '';
            error += e.stderr ? e.stderr.toString() : '';
        }

        // Get tables after restart
        const [afterResults] = await sequelize.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`
        );
        const afterTables = afterResults.map(row => row.table_name);

        // All expected tables must still exist
        for (const expectedTable of EXPECTED_TABLES) {
            expect(afterTables).toContain(expectedTable);
        }

        // No error output should mention table drops or destructive actions
        expect(error).not.toMatch(/drop table|deleted|destroyed|force: true|errore durante la sincronizzazione/i);
        // No error output should mention SequelizeDatabaseError
        expect(error).not.toMatch(/SequelizeDatabaseError/i);
    });
}); 