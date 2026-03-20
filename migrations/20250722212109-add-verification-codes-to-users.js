'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if columns already exist before adding them
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.verification_code) {
      await queryInterface.addColumn('users', 'verification_code', {
        type: Sequelize.STRING(6),
        allowNull: true
      });
    }

    if (!tableDescription.verification_code_expires_at) {
      await queryInterface.addColumn('users', 'verification_code_expires_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!tableDescription.magic_link_code) {
      await queryInterface.addColumn('users', 'magic_link_code', {
        type: Sequelize.STRING(6),
        allowNull: true
      });
    }

    if (!tableDescription.magic_link_code_expires_at) {
      await queryInterface.addColumn('users', 'magic_link_code_expires_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'verification_code');
    await queryInterface.removeColumn('users', 'verification_code_expires_at');
    await queryInterface.removeColumn('users', 'magic_link_code');
    await queryInterface.removeColumn('users', 'magic_link_code_expires_at');
  }
};
