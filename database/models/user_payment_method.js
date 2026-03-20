const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class UserPaymentMethod extends Model {
        static associate(models) {
            // Associazione con User (FK)
            UserPaymentMethod.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        }
    }

    UserPaymentMethod.init({
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
        stripe_payment_method_id: {
            type: DataTypes.STRING,
            allowNull: false
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
        modelName: 'UserPaymentMethod',
        tableName: 'user_payment_methods',
        timestamps: true,
        underscored: true
    });

    return UserPaymentMethod;
}; 