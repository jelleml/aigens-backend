const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Attachment extends Model {
    static associate(models) {
      // Associazioni con altri modelli
      Attachment.belongsTo(models.Message, { foreignKey: 'message_id' });
      Attachment.belongsTo(models.User, { foreignKey: 'user_id' });
      Attachment.belongsTo(models.Chat, { foreignKey: 'chat_id' });

      // Many-to-many association with Folder
      Attachment.belongsToMany(models.Folder, {
        through: 'folder_attachments',
        foreignKey: 'attachment_id',
        otherKey: 'folder_id'
      });
    }
  }

  Attachment.init({
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
    chat_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'chats',
        key: 'id'
      }
    },
    message_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'messages',
        key: 'id'
      },
      comment: 'Può essere null se l\'allegato non è associato a un messaggio specifico'
    },
    file_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    original_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING,
      allowNull: false
    },
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Dimensione del file in bytes'
    },
    mime_type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    file_type: {
      type: DataTypes.ENUM('image', 'video', 'audio', 'document', 'other'),
      defaultValue: 'other'
    },
    is_processed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Indica se l\'allegato è stato elaborato da un agente AI'
    },
    processing_result: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Risultato dell\'elaborazione dell\'allegato da parte dell\'agente AI'
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
    modelName: 'Attachment',
    tableName: 'attachments',
    timestamps: true,
    underscored: true
  });

  return Attachment;
}; 