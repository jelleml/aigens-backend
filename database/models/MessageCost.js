const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class MessageCost extends Model {
    static associate(models) {
      // Associazioni con altri modelli
      MessageCost.belongsTo(models.Message, { foreignKey: 'message_id' });
      MessageCost.belongsTo(models.Chat, { foreignKey: 'chat_id' });
      MessageCost.belongsTo(models.User, { foreignKey: 'user_id' });
      MessageCost.belongsTo(models.Model, { foreignKey: 'model_id' });
    }
  }

  MessageCost.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    message_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'messages',
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
    user_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    model_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'models',
        key: 'id'
      },
      comment: 'Riferimento al modello AI utilizzato'
    },
    input_tokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    output_tokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_tokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    estimated_output_ratio: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Rapporto stimato tra token di output e token di input'
    },
    real_output_ratio: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Rapporto effettivo tra token di output e token di input'
    },
    base_cost: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
      comment: 'Costo effettivo della richiesta API'
    },
    fixed_markup: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
      defaultValue: 0,
      comment: 'Markup fisso applicato'
    },
    percentage_markup: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
      defaultValue: 0,
      comment: 'Markup percentuale applicato'
    },
    total_markup: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
      defaultValue: 0,
      comment: 'Totale del markup applicato'
    },
    total_cost: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
      comment: 'Costo totale (base_cost + total_markup)'
    },
    credit_cost: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
      comment: 'Costo convertito in crediti (1 EUR = 1000 crediti)'
    },
    model_used: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Modello AI utilizzato per la richiesta'
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
    modelName: 'MessageCost',
    tableName: 'message_costs',
    timestamps: true,
    underscored: true
  });

  return MessageCost;
}; 