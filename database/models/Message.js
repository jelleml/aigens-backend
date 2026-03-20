const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Message extends Model {
    static associate(models) {
      // Associazioni con altri modelli
      Message.belongsTo(models.Chat, { foreignKey: 'chat_id' });
      Message.hasMany(models.Attachment, { foreignKey: 'message_id' });
      Message.hasOne(models.MessageCost, { foreignKey: 'message_id' });
    }
  }

  Message.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    chat_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'chats',
        key: 'id'
      }
    },
    role: {
      type: DataTypes.ENUM('user', 'assistant', 'system'),
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    agent_type: {
      type: DataTypes.ENUM('chat', 'image', 'video'),
      defaultValue: 'chat'
    },
    agent_model: {
      type: DataTypes.STRING,
      allowNull: true
    },
    tokens_used: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    cost: {
      type: DataTypes.DECIMAL(10, 6),
      defaultValue: 0
    },
    media_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    media_type: {
      type: DataTypes.ENUM('image', 'video', 'audio', 'none'),
      defaultValue: 'none'
    },
    user_like: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      comment: 'User feedback: true for like, false for dislike, null for no feedback'
    },
    user_dislike: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      comment: 'User feedback: true for dislike, false for like, null for no feedback'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    is_complete: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'Message',
    tableName: 'messages',
    timestamps: true,
    underscored: true
  });

  return Message;
}; 