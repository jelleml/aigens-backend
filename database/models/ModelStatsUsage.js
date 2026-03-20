const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModelStatsUsage = sequelize.define('ModelStatsUsage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    model_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    id_message: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    input_length: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    output_length: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    task_category1: {
      type: DataTypes.STRING,
      allowNull: true
    },
    task_category2: {
      type: DataTypes.STRING,
      allowNull: true
    },
    task_category3: {
      type: DataTypes.STRING,
      allowNull: true
    },
    task_category4: {
      type: DataTypes.STRING,
      allowNull: true
    },
    aigens_response_time: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    expected_cost: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    effective_cost: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    has_attachments: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'models_stats_usage',
    timestamps: true,
    underscored: true
  });

  ModelStatsUsage.associate = (models) => {
    ModelStatsUsage.belongsTo(models.Model, {
      foreignKey: 'model_id',
      as: 'model'
    });
    ModelStatsUsage.belongsTo(models.Message, {
      foreignKey: 'id_message',
      as: 'message'
    });
  };

  return ModelStatsUsage;
}; 