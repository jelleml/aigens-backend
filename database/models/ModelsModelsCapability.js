const { Model: SequelizeModel, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ModelsModelsCapability extends SequelizeModel {
    static associate(models) {
      // Junction table associations
      ModelsModelsCapability.belongsTo(models.Model, {
        foreignKey: 'id_model',
        as: 'model'
      });
      
      ModelsModelsCapability.belongsTo(models.ModelsCapability, {
        foreignKey: 'id_capability',
        as: 'capability'
      });
    }
  }
  
  ModelsModelsCapability.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_capability: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'models_capabilities',
        key: 'id'
      },
      comment: 'ID della capability'
    },
    id_model: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'models',
        key: 'id'
      },
      comment: 'ID del modello'
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
    sequelize,
    modelName: 'ModelsModelsCapability',
    tableName: 'models_models_capabilities',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['id_capability', 'id_model'],
        unique: true
      },
      {
        fields: ['id_model']
      },
      {
        fields: ['id_capability']
      }
    ]
  });
  
  return ModelsModelsCapability;
};