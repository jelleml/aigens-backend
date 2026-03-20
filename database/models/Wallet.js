const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Wallet extends Model {
    static associate(models) {
      // Associazioni con altri modelli
      Wallet.belongsTo(models.User, { foreignKey: 'user_id' });
      Wallet.hasMany(models.Transaction, { as: 'Transactions', foreignKey: 'wallet_id' });
    }
  }

  Wallet.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    balance: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    last_deposit_at: {
      type: DataTypes.DATE
    },
    last_withdrawal_at: {
      type: DataTypes.DATE
    },
    stripe_customer_id: {
      type: DataTypes.STRING
    },
    bitcoin_address: {
      type: DataTypes.STRING
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
    modelName: 'Wallet',
    tableName: 'wallets',
    timestamps: true,
    underscored: true
  });

  return Wallet;
}; 