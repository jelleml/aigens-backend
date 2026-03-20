const { Model, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  class User extends Model {
    static associate(models) {
      // Associazioni con altri modelli
      User.hasMany(models.Chat, { foreignKey: 'user_id', as: 'ownedChats' });
      User.hasOne(models.Wallet, { foreignKey: 'user_id' });
      User.hasMany(models.Transaction, { foreignKey: 'user_id' });
      User.hasMany(models.Prompt, { foreignKey: 'user_id' });
      User.hasMany(models.Attachment, { foreignKey: 'user_id' });
      User.hasMany(models.Lead, { foreignKey: 'user_id' });
      User.hasMany(models.Token, { foreignKey: 'user_id' });
      User.hasMany(models.UserAccess, { foreignKey: 'user_id' });
      User.hasOne(models.UserSettings, { foreignKey: 'user_id', as: 'settings' });

      // New associations for folders and shared chats
      User.hasMany(models.Folder, { foreignKey: 'user_id' });

      // Many-to-many association with Chat for shared chats
      User.belongsToMany(models.Chat, {
        through: {
          model: 'user_chats',
          unique: false
        },
        as: 'sharedChats',
        foreignKey: 'user_id',
        otherKey: 'chat_id'
      });

      // Association with Inbox for email tracking
      User.hasMany(models.Inbox, { foreignKey: 'user_id', as: 'emails' });
    }
  }

  User.init({
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4(),
      allowNull: false
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true // Now optional with passwordless auth
    },
    first_name: {
      type: DataTypes.STRING
    },
    last_name: {
      type: DataTypes.STRING
    },
    name: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.first_name && this.last_name
          ? `${this.first_name} ${this.last_name}`
          : this.first_name || this.username || this.email;
      }
    },
    role: {
      type: DataTypes.ENUM('user', 'admin'),
      defaultValue: 'user'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    verification_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    verification_code: {
      type: DataTypes.STRING(6),
      allowNull: true
    },
    verification_code_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    magic_link_code: {
      type: DataTypes.STRING(6),
      allowNull: true
    },
    magic_link_code_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    google_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    microsoft_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    github_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    alby_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    alby_access_token: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    last_login: {
      type: DataTypes.DATE
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
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password') && user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      }
    }
  });

  // Metodo per verificare la password
  User.prototype.validPassword = async function (password) {
    if (!this.password) return false;
    return await bcrypt.compare(password, this.password);
  };

  return User;
}; 