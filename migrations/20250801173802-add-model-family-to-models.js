'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Check if model_family column already exists
        const tableDescription = await queryInterface.describeTable('models');

        if (!tableDescription.model_family) {
            await queryInterface.addColumn('models', 'model_family', {
                type: Sequelize.STRING(100),
                allowNull: true,
                comment: 'Family or series the model belongs to (e.g., GPT-4, Claude 3, Llama, etc.)'
            });
        }

        // Check if index already exists before adding it
        try {
            await queryInterface.addIndex('models', ['model_family'], {
                name: 'models_model_family_idx'
            });
        } catch (error) {
            // Index might already exist, ignore error
            console.log('Index models_model_family_idx might already exist');
        }
    },

    async down(queryInterface, Sequelize) {
        // Remove index if it exists
        try {
            await queryInterface.removeIndex('models', 'models_model_family_idx');
        } catch (error) {
            // Index might not exist, ignore error
            console.log('Index models_model_family_idx might not exist');
        }

        // Remove column if it exists
        const tableDescription = await queryInterface.describeTable('models');
        if (tableDescription.model_family) {
            await queryInterface.removeColumn('models', 'model_family');
        }
    }
}; 