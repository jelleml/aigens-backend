const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AggregatedModel = sequelize.define('AggregatedModel', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_aggregator_provider: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID del provider aggregatore (es. OpenRouter, Together.ai)'
    },
    id_source_provider: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID del provider originale del modello (es. OpenAI, Anthropic)'
    },
    id_model: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID del modello nella tabella models (endpoint aggregatore)'
    },
    source_model_id: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Model ID originale del provider sorgente'
    },
    id_pricing_tier: {
      type: DataTypes.INTEGER,
      allowNull: true, // Temporarily allow null during creation
      comment: 'ID del tier di pricing utilizzato per questo modello aggregato'
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Indica se il modello è disponibile attraverso l\'aggregatore'
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
    tableName: 'aggregated_models',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['id_aggregator_provider']
      },
      {
        fields: ['id_source_provider']
      },
      {
        fields: ['id_model']
      },
      {
        fields: ['source_model_id']
      },
      {
        fields: ['id_aggregator_provider', 'id_source_provider'],
        name: 'aggregated_models_providers'
      },
      {
        fields: ['id_pricing_tier']
      },
      {
        fields: ['id_aggregator_provider', 'source_model_id'],
        unique: true,
        name: 'aggregated_models_unique'
      }
    ]
  });

  AggregatedModel.associate = (models) => {
    // Relazione con il Provider aggregatore
    if (models.Provider) {
      AggregatedModel.belongsTo(models.Provider, {
        foreignKey: 'id_aggregator_provider',
        as: 'aggregatorProvider'
      });

      // Relazione con il Provider sorgente
      AggregatedModel.belongsTo(models.Provider, {
        foreignKey: 'id_source_provider',
        as: 'sourceProvider'
      });
    }

    // Relazione con il Model (endpoint aggregatore)
    if (models.Model) {
      AggregatedModel.belongsTo(models.Model, {
        foreignKey: 'id_model',
        as: 'aggregatedModel'
      });
    }

    // Relazione con il Pricing Tier
    if (models.AggregatorPricingTier) {
      AggregatedModel.belongsTo(models.AggregatorPricingTier, {
        foreignKey: 'id_pricing_tier',
        as: 'pricingTier'
      });
    }
  };

  return AggregatedModel;
};