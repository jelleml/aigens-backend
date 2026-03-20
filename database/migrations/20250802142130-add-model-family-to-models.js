'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('models', 'model_family', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Family or series the model belongs to (e.g., GPT-4, Claude 3, Llama, etc.)',
      after: 'display_name'
    });

    // Add index for better query performance
    await queryInterface.addIndex('models', ['model_family'], {
      name: 'idx_models_model_family'
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove index first
    await queryInterface.removeIndex('models', 'idx_models_model_family');
    
    // Remove column
    await queryInterface.removeColumn('models', 'model_family');
  }
};