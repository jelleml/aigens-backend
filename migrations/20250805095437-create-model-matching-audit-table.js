'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tables = await queryInterface.showAllTables();
    const tableExists = tables.includes('model_matching_audit');

    if (!tableExists) {
      await queryInterface.createTable('model_matching_audit', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        integrated_model_slug: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: 'The integrated model slug that was being matched',
        },
        aa_model_slug: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'The AA model slug that was matched (NULL if no match)',
        },
        match_type: {
          type: Sequelize.ENUM('exact_match', 'same_family', 'llm_assisted', 'fuzzy_match', 'no_match'),
          allowNull: false,
          comment: 'Type of match found',
        },
        confidence_score: {
          type: Sequelize.DECIMAL(3, 2),
          allowNull: true,
          comment: 'Confidence score of the match (0.00-1.00)',
        },
        tier_used: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: 'Matching tier used (1=exact, 2=family, 3=llm, 4=fuzzy)',
        },
        reasoning: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Detailed explanation of the matching decision',
        },
        processing_time_ms: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: 'Time taken to process this match in milliseconds',
        },
        llm_used: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: 'Whether LLM assistance was used for this match',
        },
        alternatives_considered: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'JSON array of alternative matches that were considered',
        },
        created_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
          comment: 'When this audit record was created',
        },
      });
    }

    // Add indexes with error handling
    const indexes = [
      { name: 'idx_audit_integrated_model', columns: ['integrated_model_slug'] },
      { name: 'idx_audit_aa_model', columns: ['aa_model_slug'] },
      { name: 'idx_audit_match_type', columns: ['match_type'] },
      { name: 'idx_audit_confidence', columns: ['confidence_score'] },
      { name: 'idx_audit_tier', columns: ['tier_used'] },
      { name: 'idx_audit_created_at', columns: ['created_at'] },
      { name: 'idx_audit_llm_used', columns: ['llm_used'] }
    ];

    for (const index of indexes) {
      try {
        await queryInterface.addIndex('model_matching_audit', index.columns, {
          name: index.name
        });
      } catch (error) {
        // Index might already exist, ignore error
        console.log(`Index ${index.name} might already exist`);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableExists = tables.includes('model_matching_audit');

    if (tableExists) {
      await queryInterface.dropTable('model_matching_audit');
    }
  }
}; 