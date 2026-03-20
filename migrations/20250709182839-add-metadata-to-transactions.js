'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('transactions');
    if (!table['metadata']) {
      await queryInterface.addColumn('transactions', 'metadata', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Dati aggiuntivi come bonus crediti, sconti, ecc.'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('transactions', 'metadata');
  }
};
