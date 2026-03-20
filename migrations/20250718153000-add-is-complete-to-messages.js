'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Verifica se la colonna esiste già
        const tableInfo = await queryInterface.describeTable('messages');

        if (!tableInfo.is_complete) {
            await queryInterface.addColumn('messages', 'is_complete', {
                type: Sequelize.BOOLEAN,
                defaultValue: true,
                allowNull: false,
                after: 'user_dislike'
            });

            // Aggiorna tutti i messaggi esistenti come completati
            await queryInterface.sequelize.query(`
        UPDATE messages 
        SET is_complete = true 
        WHERE is_complete IS NULL
      `);
        }
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('messages', 'is_complete');
    }
}; 