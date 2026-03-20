const { Model: SequelizeModel, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ModelsCapability extends SequelizeModel {
    static associate(models) {
      // Una capability può essere associata a molti modelli
      ModelsCapability.belongsToMany(models.Model, {
        through: models.ModelsModelsCapability,
        foreignKey: 'id_capability',
        otherKey: 'id_model',
        as: 'models'
      });
    }
  }
  
  ModelsCapability.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'Nome della capability (es. text, vision, reasoning)'
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Tipo di capability (es. input, output, processing)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Descrizione dettagliata della capability'
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
    modelName: 'ModelsCapability',
    tableName: 'models_capabilities',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['name'],
        unique: true
      },
      {
        fields: ['type']
      }
    ]
  });
  
  return ModelsCapability;
};