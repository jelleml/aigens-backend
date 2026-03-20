'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new columns for enhanced matching metadata
    await queryInterface.addColumn('models_models_stats_aa', 'confidence_score', {
      type: Sequelize.DECIMAL(3, 2),
      allowNull: true,
      comment: 'Confidence score of the match (0.00-1.00)'
    });

    await queryInterface.addColumn('models_models_stats_aa', 'matching_tier', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Tier used for matching (1=exact, 2=family, 3=llm, 4=fuzzy)'
    });

    await queryInterface.addColumn('models_models_stats_aa', 'reasoning', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Explanation of why this match was made'
    });

    await queryInterface.addColumn('models_models_stats_aa', 'requires_manual_review', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Flag indicating if this match needs manual review'
    });

    // Add indexes for the new columns
    await queryInterface.addIndex('models_models_stats_aa', ['confidence_score'], {
      name: 'idx_models_models_stats_aa_confidence'
    });

    await queryInterface.addIndex('models_models_stats_aa', ['matching_tier'], {
      name: 'idx_models_models_stats_aa_tier'
    });

    await queryInterface.addIndex('models_models_stats_aa', ['requires_manual_review'], {
      name: 'idx_models_models_stats_aa_manual_review'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    await queryInterface.removeIndex('models_models_stats_aa', 'idx_models_models_stats_aa_manual_review');
    await queryInterface.removeIndex('models_models_stats_aa', 'idx_models_models_stats_aa_tier');
    await queryInterface.removeIndex('models_models_stats_aa', 'idx_models_models_stats_aa_confidence');
    
    // Remove columns
    await queryInterface.removeColumn('models_models_stats_aa', 'requires_manual_review');
    await queryInterface.removeColumn('models_models_stats_aa', 'reasoning');
    await queryInterface.removeColumn('models_models_stats_aa', 'matching_tier');
    await queryInterface.removeColumn('models_models_stats_aa', 'confidence_score');
  }
};