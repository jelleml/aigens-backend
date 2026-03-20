const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subscription = sequelize.define('ProviderSubscription', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_provider: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID del provider della sottoscrizione'
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Nome del tipo di sottoscrizione (es. Team, Premium, etc.)'
    },
    cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Costo mensile della sottoscrizione'
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Sorgente del dato (es. official_website, api, manual, etc.)'
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
    tableName: 'provider_subscriptions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['id_provider']
      },
      {
        fields: ['name']
      },
      {
        fields: ['source']
      },
      {
        fields: ['id_provider', 'name'],
        unique: true,
        name: 'subscriptions_unique'
      }
    ]
  });

  Subscription.associate = (models) => {
    // Una subscription appartiene a un provider
    if (models.Provider) {
      Subscription.belongsTo(models.Provider, {
        foreignKey: 'id_provider',
        as: 'provider'
      });
    }

    // Una subscription può avere molte ModelsSubscription
    if (models.ModelsSubscription) {
      Subscription.hasMany(models.ModelsSubscription, {
        foreignKey: 'id_subscription',
        as: 'modelSubscriptions'
      });
    }
  };

  return Subscription;
};
