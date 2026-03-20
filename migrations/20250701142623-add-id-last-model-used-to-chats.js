'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Safe add: controlla se la colonna esiste già
    const table = await queryInterface.describeTable('chats');
    if (!table['id_last_model_used']) {
      await queryInterface.addColumn('chats', 'id_last_model_used', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'models',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Ultimo modello AI usato in questa chat'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('chats', 'id_last_model_used');
  }
};
