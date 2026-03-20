'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('transactions', 'invoice_id', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'ID della invoice su BTCPay'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('transactions', 'invoice_id');
  }
};
