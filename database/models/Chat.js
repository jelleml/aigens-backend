const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Chat extends Model {
    static associate(models) {
      // Associazioni con altri modelli
      Chat.belongsTo(models.User, { as: 'owner', foreignKey: 'user_id' });
      Chat.hasMany(models.Message, { as: 'Messages', foreignKey: 'chat_id' });
      Chat.hasMany(models.Attachment, { foreignKey: 'chat_id' });

      // Many-to-many association with Folder
      Chat.belongsToMany(models.Folder, {
        through: 'folder_chats',
        foreignKey: 'chat_id',
        otherKey: 'folder_id'
      });

      // Many-to-many association with User for shared chats
      Chat.belongsToMany(models.User, {
        through: {
          model: 'user_chats',
          unique: false
        },
        as: 'sharedUsers',
        foreignKey: 'chat_id',
        otherKey: 'user_id'
      });
    }
  }

  Chat.init({
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
      allowNull: false,
      defaultValue: 'Nuova Chat'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_shared: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Indicates if this chat is shared with other users'
    },
    use_auto_selector: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Indicates if the user is using auto-selector for model selection in this chat'
    },
    last_message_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    id_last_model_used: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'models',
        key: 'id'
      },
      comment: 'Ultimo modello AI usato in questa chat'
    }
  }, {
    sequelize,
    modelName: 'Chat',
    tableName: 'chats',
    timestamps: true,
    underscored: true
  });

  return Chat;
}; 