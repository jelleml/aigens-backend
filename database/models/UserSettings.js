const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class UserSettings extends Model {
        static associate(models) {
            UserSettings.belongsTo(models.User, { foreignKey: 'user_id' });
        }
    }

    UserSettings.init({
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
        },
        // Profile related settings
        default_language: {
            type: DataTypes.STRING,
            defaultValue: 'en',
        },
        auto_save_chats: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        enable_notifications: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        dark_mode: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        show_tooltips: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        // I seguenti parametri sono utilizzati dalla funzionalità "auto-selector" per la selezione automatica dei modelli
        costs: {
            type: DataTypes.INTEGER,
            defaultValue: 5,
            validate: { min: 0, max: 10 },
        },
        quality: {
            type: DataTypes.INTEGER,
            defaultValue: 50,
            validate: { min: 0, max: 100 },
        },
        speed: {
            type: DataTypes.INTEGER,
            defaultValue: 50,
            validate: { min: 0, max: 100 },
        },
        syntheticity: {
            type: DataTypes.INTEGER,
            defaultValue: 50,
            validate: { min: 0, max: 100 },
        },
        creativity: {
            type: DataTypes.INTEGER,
            defaultValue: 50,
            validate: { min: 0, max: 100 },
        },
        scientificity: {
            type: DataTypes.INTEGER,
            defaultValue: 50,
            validate: { min: 0, max: 100 },
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    }, {
        sequelize,
        modelName: 'UserSettings',
        tableName: 'user_settings',
        timestamps: true,
        underscored: true,
    });

    return UserSettings;
}; 