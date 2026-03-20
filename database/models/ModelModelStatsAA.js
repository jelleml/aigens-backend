const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModelModelStatsAA = sequelize.define('ModelModelStatsAA', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_model: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'models',
        key: 'id'
      },
      comment: 'ID del modello nella tabella models'
    },
    id_model_aa: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'models_stats_aa',
        key: 'id'
      },
      comment: 'ID del modello nella tabella models_stats_aa'
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Tipo di relazione (exact_match, same_family, etc.)'
    },
    // Enhanced matching metadata columns
    confidence_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      comment: 'Confidence score of the match (0.00-1.00)'
    },
    matching_tier: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Tier used for matching (1=exact, 2=family, 3=llm, 4=fuzzy)'
    },
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Explanation of why this match was made'
    },
    requires_manual_review: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Flag indicating if this match needs manual review'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'models_models_stats_aa',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['id_model', 'id_model_aa']
      },
      {
        fields: ['type']
      },
      {
        name: 'idx_models_models_stats_aa_confidence',
        fields: ['confidence_score']
      },
      {
        name: 'idx_models_models_stats_aa_tier',
        fields: ['matching_tier']
      },
      {
        name: 'idx_models_models_stats_aa_manual_review',
        fields: ['requires_manual_review']
      }
    ]
  });

  ModelModelStatsAA.associate = (models) => {
    ModelModelStatsAA.belongsTo(models.Model, {
      foreignKey: 'id_model',
      as: 'model'
    });
    
    ModelModelStatsAA.belongsTo(models.ModelStatsAA, {
      foreignKey: 'id_model_aa',
      as: 'modelStatsAA'
    });
  };

  return ModelModelStatsAA;
}; 