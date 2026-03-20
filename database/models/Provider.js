const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Provider = sequelize.define('Provider', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'Nome del provider (es. Anthropic, OpenAI, DeepSeek)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Descrizione del provider'
    },
    provider_type: {
      type: DataTypes.ENUM('direct', 'indirect', 'both', 'aggregator'),
      allowNull: false,
      defaultValue: 'direct',
      comment: 'Tipo di provider: direct (integrazione diretta), indirect (solo tramite aggregatori), both (entrambi), aggregator (servizio aggregatore)'
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
    tableName: 'providers',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['name']
      },
      {
        fields: ['provider_type']
      }
    ]
  });

  Provider.associate = (models) => {
    // Un provider può avere molte subscription
    if (models.ProviderSubscription) {
      Provider.hasMany(models.ProviderSubscription, {
        foreignKey: 'id_provider',
        as: 'subscriptions'
      });
    }

    // Un provider può avere molti modelli
    if (models.Model) {
      Provider.hasMany(models.Model, {
        foreignKey: 'id_provider',
        as: 'models'
      });
    }

    // Un provider può avere molte ModelsSubscription
    if (models.ModelsSubscription) {
      Provider.hasMany(models.ModelsSubscription, {
        foreignKey: 'id_provider',
        as: 'modelSubscriptions'
      });
    }

    // Relazioni per aggregatori
    if (models.AggregatedModel) {
      // Come provider aggregatore
      Provider.hasMany(models.AggregatedModel, {
        foreignKey: 'id_aggregator_provider',
        as: 'aggregatedModels'
      });

      // Come provider sorgente
      Provider.hasMany(models.AggregatedModel, {
        foreignKey: 'id_source_provider',
        as: 'sourceAggregatedModels'
      });
    }

    // Pricing tiers per aggregatori
    if (models.AggregatorPricingTier) {
      Provider.hasMany(models.AggregatorPricingTier, {
        foreignKey: 'id_aggregator_provider',
        as: 'pricingTiers'
      });
    }
  };

  return Provider;
}; 