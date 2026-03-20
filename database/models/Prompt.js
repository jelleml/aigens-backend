const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Prompt extends Model {
    static associate(models) {
      // Associazioni con altri modelli
      Prompt.belongsTo(models.User, { foreignKey: 'user_id' });
    }
  }

  Prompt.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    agent_type: {
      type: DataTypes.ENUM('chat', 'image', 'video'),
      defaultValue: 'chat'
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    tags: {
      type: DataTypes.STRING
    },
    usage_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
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
    modelName: 'Prompt',
    tableName: 'prompts',
    timestamps: true,
    underscored: true
  });

  return Prompt;
}; 