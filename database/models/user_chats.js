const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class user_chats extends Model { }

    user_chats.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        chat_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        is_pinned: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'user_chats',
        tableName: 'user_chats',
        timestamps: true,
        underscored: true
    });

    return user_chats;
}; 