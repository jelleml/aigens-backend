const { Model, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    class Inbox extends Model {
        static associate(models) {
            Inbox.belongsTo(models.User, { foreignKey: 'user_id' });
        }
    }

    Inbox.init({
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: () => uuidv4(),
            allowNull: false
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        recipient: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email_slug: {
            type: DataTypes.STRING,
            allowNull: false
        },
        subject: {
            type: DataTypes.STRING,
            allowNull: false
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        replacements: {
            type: DataTypes.JSON,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'sent', 'error'),
            defaultValue: 'pending'
        },
        retry_count: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        sent_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        error_message: {
            type: DataTypes.TEXT,
            allowNull: true
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
        modelName: 'Inbox',
        tableName: 'inbox',
        timestamps: true,
        underscored: true
    });

    return Inbox;
}; 