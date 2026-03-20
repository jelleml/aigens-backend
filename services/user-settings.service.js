const db = require('../database');
const { UserSettings, User } = db.sequelize.models;

class UserSettingsService {
    async getByUserId(userId) {
        return UserSettings.findOne({ where: { user_id: userId } });
    }

    async create(userId, data) {
        return UserSettings.create({ ...data, user_id: userId });
    }

    async update(userId, data) {
        const settings = await UserSettings.findOne({ where: { user_id: userId } });
        if (!settings) throw new Error('Settings not found');
        return settings.update(data);
    }

    async delete(userId) {
        return UserSettings.destroy({ where: { user_id: userId } });
    }
}

module.exports = new UserSettingsService(); 