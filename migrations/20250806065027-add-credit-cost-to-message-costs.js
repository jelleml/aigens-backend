'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('message_costs', 'credit_cost', {
      type: Sequelize.DECIMAL(10, 6),
      allowNull: true,
      comment: 'Costo convertito in crediti (1 EUR = 1000 crediti)'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('message_costs', 'credit_cost');
  }
};
