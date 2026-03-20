'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Change price_image column from FLOAT to TEXT to support JSON storage
    await queryInterface.changeColumn('models_price_score', 'price_image', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Prezzo per interazione di generazione immagine (JSON format for operation-specific pricing)'
    });

    // Check if price_video column already exists before adding it
    const tableDescription = await queryInterface.describeTable('models_price_score');

    if (!tableDescription.price_video) {
      // Add price_video column for video generation pricing
      await queryInterface.addColumn('models_price_score', 'price_video', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Prezzo per interazione di generazione video (JSON format for operation-specific pricing)'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove price_video column if it exists
    const tableDescription = await queryInterface.describeTable('models_price_score');

    if (tableDescription.price_video) {
      await queryInterface.removeColumn('models_price_score', 'price_video');
    }

    // Revert back to FLOAT (note: this will lose JSON data)
    await queryInterface.changeColumn('models_price_score', 'price_image', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Prezzo per interazione di generazione immagine'
    });
  }
};
