const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Token extends Model {
        static associate(models) {
            // Associazioni con altri modelli
            Token.belongsTo(models.User, { foreignKey: 'user_id' });
        }
    }

    Token.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false
        },
        token: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        ttl: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 3600000 // Default to 1 hour in milliseconds
        },
        is_valid: {
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
        modelName: 'Token',
        tableName: 'tokens',
        timestamps: true,
        underscored: true
    });

    return Token;
}; 