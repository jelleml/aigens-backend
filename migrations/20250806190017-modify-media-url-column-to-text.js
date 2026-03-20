'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Modifica il campo media_url da VARCHAR(255) a TEXT per supportare URL lunghi
     * come quelli di Google Cloud Storage
     */
    await queryInterface.changeColumn('messages', 'media_url', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Revert: cambia il campo media_url da TEXT a VARCHAR(255)
     */
    await queryInterface.changeColumn('messages', 'media_url', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
