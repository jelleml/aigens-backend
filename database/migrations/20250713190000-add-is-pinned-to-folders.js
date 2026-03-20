'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('folders', 'is_pinned', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'Indica se la folder è pinnata in alto dall’utente',
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('folders', 'is_pinned');
    }
}; 