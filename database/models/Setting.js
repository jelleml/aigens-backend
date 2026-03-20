const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Setting extends Model {
    static associate(models) {
      // definire le associazioni qui se necessario
    }
  }
  
  Setting.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    agent_type: {
      type: DataTypes.ENUM('chat', 'image', 'video', 'other'),
      defaultValue: 'other'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
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
    modelName: 'Setting',
    tableName: 'settings',
    timestamps: true,
    underscored: true
  });
  
  return Setting;
}; 