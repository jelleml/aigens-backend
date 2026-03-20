const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AggregatorPricingTier = sequelize.define('AggregatorPricingTier', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_aggregator_provider: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID del provider aggregatore (es. Together.ai, OpenRouter)'
    },
    tier_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Nome del tier di pricing (es. standard, premium, enterprise)'
    },
    markup_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Percentuale di markup applicata dall\'aggregatore (es. 15.50 per 15.5%)'
    },
    markup_fixed: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
      defaultValue: 0.000000,
      comment: 'Costo fisso aggiuntivo per request in USD (es. 0.005000)'
    },
    min_volume: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Volume minimo di richieste mensili per questo tier'
    },
    max_volume: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Volume massimo di richieste mensili per questo tier (NULL = illimitato)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Descrizione dettagliata del tier di pricing'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Indica se questo tier è attualmente attivo'
    },
    effective_from: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Data di inizio validità del pricing'
    },
    effective_until: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Data di fine validità del pricing (NULL = indefinito)'
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
    tableName: 'aggregator_pricing_tiers',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['id_aggregator_provider']
      },
      {
        fields: ['tier_name']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['min_volume', 'max_volume'],
        name: 'volume_range_idx'
      },
      {
        fields: ['id_aggregator_provider', 'tier_name'],
        unique: true,
        name: 'unique_aggregator_tier'
      }
    ]
  });

  AggregatorPricingTier.associate = (models) => {
    // Relazione con il Provider aggregatore
    if (models.Provider) {
      AggregatorPricingTier.belongsTo(models.Provider, {
        foreignKey: 'id_aggregator_provider',
        as: 'aggregatorProvider'
      });
    }

    // Un pricing tier può essere utilizzato da molti aggregated models
    if (models.AggregatedModel) {
      AggregatorPricingTier.hasMany(models.AggregatedModel, {
        foreignKey: 'id_pricing_tier',
        as: 'aggregatedModels'
      });
    }
  };

  return AggregatorPricingTier;
};