const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModelPriceHistory = sequelize.define('ModelPriceHistory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_model: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    price_1m_input_tokens: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    price_1m_output_tokens: {
      type: DataTypes.FLOAT,
      allowNull: false
    }
  }, {
    tableName: 'models_price_history',
    timestamps: true,
    underscored: true
  });

  ModelPriceHistory.associate = (models) => {
    ModelPriceHistory.belongsTo(models.Model, {
      foreignKey: 'model_id',
      as: 'model'
    });
  };

  return ModelPriceHistory;
}; 