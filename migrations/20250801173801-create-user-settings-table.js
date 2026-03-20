'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_settings', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      // Profile related settings
      default_language: {
        type: Sequelize.STRING,
        defaultValue: 'italian',
      },
      auto_save_chats: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      enable_notifications: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      dark_mode: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      show_tooltips: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      // Auto-selector parameters
      costs: {
        type: Sequelize.INTEGER,
        defaultValue: 5,
        validate: { min: 0, max: 10 },
      },
      quality: {
        type: Sequelize.INTEGER,
        defaultValue: 50,
        validate: { min: 0, max: 100 },
      },
      speed: {
        type: Sequelize.INTEGER,
        defaultValue: 50,
        validate: { min: 0, max: 100 },
      },
      syntheticity: {
        type: Sequelize.INTEGER,
        defaultValue: 50,
        validate: { min: 0, max: 100 },
      },
      creativity: {
        type: Sequelize.INTEGER,
        defaultValue: 50,
        validate: { min: 0, max: 100 },
      },
      scientificity: {
        type: Sequelize.INTEGER,
        defaultValue: 50,
        validate: { min: 0, max: 100 },
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_settings');
  }
};
