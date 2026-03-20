const { Model, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    class Folder extends Model {
        static associate(models) {
            // Self-referencing relationship for folder hierarchy
            Folder.belongsTo(Folder, { as: 'parentFolder', foreignKey: 'parent_id' });
            Folder.hasMany(Folder, { as: 'subFolders', foreignKey: 'parent_id' });

            // Folder belongs to a user
            Folder.belongsTo(models.User, { foreignKey: 'user_id' });

            // Folder-Chat association (many-to-many)
            Folder.belongsToMany(models.Chat, {
                through: 'folder_chats',
                foreignKey: 'folder_id',
                otherKey: 'chat_id'
            });

            // Folder-Attachment association (many-to-many)
            Folder.belongsToMany(models.Attachment, {
                through: 'folder_attachments',
                foreignKey: 'folder_id',
                otherKey: 'attachment_id'
            });
        }
    }

    Folder.init({
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
            comment: 'The owner of the folder'
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        parent_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'folders',
                key: 'id'
            },
            comment: 'NULL for root folders, UUID of parent folder for subfolders'
        },
        path: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Materialized path for efficient tree traversal'
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: 'Indicates if this is the user\'s default folder'
        },
        is_pinned: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: 'Indica se la folder è pinnata in alto dall’utente'
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
        modelName: 'Folder',
        tableName: 'folders',
        timestamps: true,
        underscored: true,
        hooks: {
            beforeCreate: async (folder) => {
                if (!folder.parent_id) {
                    // Root folder
                    folder.path = folder.id;
                } else {
                    // Find parent folder to build path
                    const parentFolder = await sequelize.models.Folder.findByPk(folder.parent_id);
                    if (parentFolder) {
                        folder.path = `${parentFolder.path}/${folder.id}`;
                    }
                }
            }
        }
    });

    return Folder;
}; 