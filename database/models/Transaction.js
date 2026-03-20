const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Transaction extends Model {
    static associate(models) {
      // Associazioni con altri modelli
      Transaction.belongsTo(models.User, { foreignKey: 'user_id' });
      Transaction.belongsTo(models.Wallet, { as: 'Wallet', foreignKey: 'wallet_id' });
    }
  }

  Transaction.init({
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
    wallet_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'wallets',
        key: 'id'
      }
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'USD'
    },
    type: {
      type: DataTypes.ENUM('deposit', 'withdrawal', 'usage', 'refund'),
      allowNull: false
    },
    payment_method: {
      type: DataTypes.ENUM('stripe', 'bitcoin', 'system'),
      allowNull: false,
      defaultValue: 'system'
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    description: {
      type: DataTypes.TEXT
    },
    transaction_id: {
      type: DataTypes.STRING,
      comment: 'ID della transazione nel sistema di pagamento esterno'
    },
    invoice_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'ID della invoice su BTCPay'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Dati aggiuntivi come bonus crediti, sconti, ecc.'
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
    modelName: 'Transaction',
    tableName: 'transactions',
    timestamps: true,
    underscored: true
  });

  return Transaction;
}; 