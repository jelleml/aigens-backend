'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Rimuovi il campo efficiency
    await queryInterface.removeColumn('user_settings', 'efficiency');
    
    // Aggiungi il campo costs
    await queryInterface.addColumn('user_settings', 'costs', {
      type: Sequelize.INTEGER,
      defaultValue: 5,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Rimuovi il campo costs
    await queryInterface.removeColumn('user_settings', 'costs');
    
    // Ripristina il campo efficiency
    await queryInterface.addColumn('user_settings', 'efficiency', {
      type: Sequelize.INTEGER,
      defaultValue: 50,
      allowNull: false,
    });
  }
};
