'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if credit_cost column already exists
    const tableDescription = await queryInterface.describeTable('message_costs');

    if (!tableDescription.credit_cost) {
      await queryInterface.addColumn('message_costs', 'credit_cost', {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: true,
        comment: 'Costo convertito in crediti (1 EUR = 1000 crediti)'
      });
      console.log('✅ Column credit_cost added to message_costs table');
    } else {
      console.log('ℹ️  Column credit_cost already exists in message_costs table');
    }
  },

  async down(queryInterface, Sequelize) {
    // Check if credit_cost column exists before removing
    const tableDescription = await queryInterface.describeTable('message_costs');

    if (tableDescription.credit_cost) {
      await queryInterface.removeColumn('message_costs', 'credit_cost');
      console.log('✅ Column credit_cost removed from message_costs table');
    } else {
      console.log('ℹ️  Column credit_cost does not exist in message_costs table');
    }
  }
};
