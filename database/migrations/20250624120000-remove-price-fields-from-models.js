'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('models', 'input_price_per_million');
    await queryInterface.removeColumn('models', 'output_price_per_million');
    await queryInterface.removeColumn('models', 'input_price_per_token');
    await queryInterface.removeColumn('models', 'output_price_per_token');
    await queryInterface.removeColumn('models', 'output_ratio');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('models', 'input_price_per_million', {
      type: Sequelize.DECIMAL(10, 6),
      allowNull: false,
      comment: 'Prezzo per milione di token di input in USD'
    });
    await queryInterface.addColumn('models', 'output_price_per_million', {
      type: Sequelize.DECIMAL(10, 6),
      allowNull: false,
      comment: 'Prezzo per milione di token di output in USD'
    });
    await queryInterface.addColumn('models', 'input_price_per_token', {
      type: Sequelize.DECIMAL(12, 10),
      allowNull: false,
      comment: 'Prezzo per singolo token di input in USD'
    });
    await queryInterface.addColumn('models', 'output_price_per_token', {
      type: Sequelize.DECIMAL(12, 10),
      allowNull: false,
      comment: 'Prezzo per singolo token di output in USD'
    });
    await queryInterface.addColumn('models', 'output_ratio', {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 1.5,
      comment: 'Rapporto medio tra token di output e token di input'
    });
  }
}; 