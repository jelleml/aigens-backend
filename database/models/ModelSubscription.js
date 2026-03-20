const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModelSubscription = sequelize.define('ModelsSubscription', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_provider: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID del provider'
    },
    id_model: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID del modello'
    },
    id_subscription: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID della subscription'
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
    tableName: 'models_subscriptions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['id_provider']
      },
      {
        fields: ['id_model']
      },
      {
        fields: ['id_subscription']
      },
      {
        fields: ['id_provider', 'id_model', 'id_subscription'],
        unique: true,
        name: 'model_subscriptions_unique'
      }
    ]
  });

  ModelSubscription.associate = (models) => {
    // Relazione con Provider
    if (models.Provider) {
      ModelSubscription.belongsTo(models.Provider, {
        foreignKey: 'id_provider',
        as: 'provider'
      });
    }

    // Relazione con Model
    if (models.Model) {
      ModelSubscription.belongsTo(models.Model, {
        foreignKey: 'id_model',
        as: 'model'
      });
    }

    // Relazione con ProviderSubscription
    if (models.ProviderSubscription) {
      ModelSubscription.belongsTo(models.ProviderSubscription, {
        foreignKey: 'id_subscription',
        as: 'subscription'
      });
    }
  };

  return ModelSubscription;
}; 