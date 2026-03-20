const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserModelUsageStats = sequelize.define('UserModelUsageStats', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_user: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'ID dell\'utente nella tabella users'
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Tipo di statistica (es. tokens_used, cost_spent, messages_count, etc.)'
    },
    label: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Label della statistica (es. "Total Tokens Used", "Cost per Model", etc.)'
    },
    value: {
      type: DataTypes.FLOAT,
      allowNull: false,
      comment: 'Valore della statistica'
    },
    aggregation_level: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Livello di aggregazione temporale della statistica (day,  last7days, last14days, last30days, thisMonth, last3month, year)'
    },
    calculated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Data del calcolo della statistica'
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
    tableName: 'user_model_usage_stats',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['id_user']
      },
      {
        fields: ['type']
      },
      {
        fields: ['aggregation_level']
      },
      {
        fields: ['calculated_at']
      },
      {
        fields: ['id_user', 'type', 'aggregation_level', 'label'],
        unique: true,
        name: 'user_model_usage_stats_unique'
      }
    ]
  });

  UserModelUsageStats.associate = (models) => {
    UserModelUsageStats.belongsTo(models.User, {
      foreignKey: 'id_user',
      as: 'user'
    });
  };

  return UserModelUsageStats;
};
