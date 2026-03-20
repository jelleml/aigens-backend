const { Model, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    class UserAccess extends Model {
        static associate(models) {
            // Define association with User model
            UserAccess.belongsTo(models.User, { foreignKey: 'user_id' });
        }
    }

    UserAccess.init({
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: () => uuidv4(),
            allowNull: false
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
        },
        device_type: {
            type: DataTypes.ENUM('mobile', 'tablet', 'desktop'),
            allowNull: false
        },
        browser: {
            type: DataTypes.STRING,
            allowNull: false
        },
        operating_system: {
            type: DataTypes.STRING,
            allowNull: false
        },
        ip_address: {
            type: DataTypes.STRING,
            allowNull: true
        },
        accessed_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false
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
        modelName: 'UserAccess',
        tableName: 'user_accesses',
        timestamps: true,
        underscored: true
    });

    return UserAccess;
}; 