'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('models_capabilities', 'visible', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether this capability should be visible in the UI'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('models_capabilities', 'visible');
  }
};