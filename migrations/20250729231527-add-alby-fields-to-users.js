'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if alby_id column already exists
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.alby_id) {
      await queryInterface.addColumn('users', 'alby_id', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      });
    }

    if (!tableDescription.alby_access_token) {
      await queryInterface.addColumn('users', 'alby_access_token', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.alby_id) {
      await queryInterface.removeColumn('users', 'alby_id');
    }

    if (tableDescription.alby_access_token) {
      await queryInterface.removeColumn('users', 'alby_access_token');
    }
  }
};
