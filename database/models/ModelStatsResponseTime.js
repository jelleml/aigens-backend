const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModelStatsResponseTime = sequelize.define('ModelStatsResponseTime', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    model_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false
    },
    response_time: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    last_response_time_date: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    tableName: 'models_stats_response_time',
    timestamps: true,
    underscored: true
  });

  ModelStatsResponseTime.associate = (models) => {
    ModelStatsResponseTime.belongsTo(models.Model, {
      foreignKey: 'model_id',
      as: 'model'
    });
  };

  return ModelStatsResponseTime;
}; 