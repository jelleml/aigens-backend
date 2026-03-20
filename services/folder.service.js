/**
 * Service per la gestione delle cartelle
 * @module services/folder.service
 */

const db = require('../database');
const { Folder, User, Chat, Attachment } = db.sequelize.models;
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

/**
 * Ottiene tutte le cartelle dell'utente
 * @param {string} userId - ID dell'utente
 * @returns {Promise<Array>} Lista di cartelle
 */
const getUserFolders = async (userId) => {
    const folders = await Folder.findAll({
        where: { user_id: userId },
        // L'ordinamento DB è solo alfabetico, quello finale sarà custom
        order: [['name', 'ASC']]
    });
    // ORDINA: pinned alfabetico, poi unpinned alfabetico
    return folders.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    });
};

/**
 * Ottiene le cartelle root dell'utente (senza padre)
 * @param {string} userId - ID dell'utente
 * @returns {Promise<Array>} Lista di cartelle root
 */
const getRootFolders = async (userId) => {
    const folders = await Folder.findAll({
        where: {
            user_id: userId,
            parent_id: null
        },
        order: [['name', 'ASC']]
    });
    return folders.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    });
};

/**
 * Ottiene le sottocartelle di una cartella
 * @param {string} folderId - ID della cartella
 * @returns {Promise<Array>} Lista di sottocartelle
 */
const getSubFolders = async (folderId) => {
    const folders = await Folder.findAll({
        where: { parent_id: folderId },
        order: [['name', 'ASC']]
    });
    return folders.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    });
};

/**
 * Ottiene una cartella specifica
 * @param {string} folderId - ID della cartella
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @returns {Promise<Object>} Dati della cartella
 */
const getFolder = async (folderId, userId) => {
    return await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });
};

/**
 * Crea una nuova cartella
 * @param {Object} folderData - Dati della cartella da creare
 * @param {string} folderData.name - Nome della cartella
 * @param {string} folderData.user_id - ID dell'utente proprietario
 * @param {string} [folderData.parent_id] - ID della cartella padre (opzionale)
 * @returns {Promise<Object>} Cartella creata
 */
const createFolder = async (folderData) => {
    // Genera un UUID per la cartella
    const folderId = uuidv4();

    // Se parent_id è fornito, verifica che esista e che l'utente abbia accesso
    if (folderData.parent_id) {
        const parentFolder = await Folder.findOne({
            where: {
                id: folderData.parent_id,
                user_id: folderData.user_id
            }
        });

        if (!parentFolder) {
            throw new Error('Cartella padre non trovata o non accessibile');
        }
    }

    // Crea la cartella
    const folder = await Folder.create({
        id: folderId,
        name: folderData.name,
        user_id: folderData.user_id,
        parent_id: folderData.parent_id || null
    });

    return folder;
};

/**
 * Aggiorna una cartella
 * @param {string} folderId - ID della cartella da aggiornare
 * @param {Object} folderData - Dati da aggiornare
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @returns {Promise<Object>} Cartella aggiornata
 */
const updateFolder = async (folderId, folderData, userId) => {
    // Verifica che la cartella esista e appartenga all'utente
    const folder = await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });

    if (!folder) {
        throw new Error('Cartella non trovata o non accessibile');
    }

    // Verifica che non ci sia un ciclo nel cambio di parent_id
    if (folderData.parent_id && folderData.parent_id !== folder.parent_id) {
        // Non può essere spostata nella stessa cartella
        if (folderData.parent_id === folderId) {
            throw new Error('Una cartella non può essere spostata in se stessa');
        }

        // Verifica che la cartella parent esista e appartenga all'utente
        const parentFolder = await Folder.findOne({
            where: {
                id: folderData.parent_id,
                user_id: userId
            }
        });

        if (!parentFolder) {
            throw new Error('Cartella padre non trovata o non accessibile');
        }

        // Verifica che non ci sia un ciclo nel tree (nuova parent non è una sottocartella della cartella corrente)
        const subFolders = await getAllDescendants(folderId);
        if (subFolders.some(subFolder => subFolder.id === folderData.parent_id)) {
            throw new Error('Spostamento non valido: creerebbe un ciclo nel tree delle cartelle');
        }
    }

    // Aggiorna la cartella
    await folder.update({
        name: folderData.name || folder.name,
        parent_id: folderData.parent_id === undefined ? folder.parent_id : folderData.parent_id
    });

    // Se parent_id è cambiato, aggiorna il path
    if (folderData.parent_id !== undefined && folderData.parent_id !== folder.parent_id) {
        await updateFolderPath(folder);
    }

    return folder;
};

/**
 * Elimina una cartella
 * @param {string} folderId - ID della cartella da eliminare
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @returns {Promise<boolean>} true se eliminata correttamente
 */
const deleteFolder = async (folderId, userId) => {
    // Verifica che la cartella esista e appartenga all'utente
    const folder = await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });

    if (!folder) {
        throw new Error('Cartella non trovata o non accessibile');
    }

    // Non è possibile eliminare una cartella predefinita
    if (folder.is_default) {
        throw new Error('Impossibile eliminare la cartella predefinita');
    }

    // Elimina la cartella (le associazioni e le sottocartelle verranno eliminate a cascata)
    await folder.destroy();

    return true;
};

/**
 * Aggiorna il path della cartella e di tutte le sue sottocartelle
 * @param {Object} folder - Cartella da aggiornare
 * @returns {Promise<void>}
 */
const updateFolderPath = async (folder) => {
    // Aggiorna il path della cartella corrente
    if (!folder.parent_id) {
        // Root folder
        folder.path = folder.id;
    } else {
        // Trova la cartella genitore per costruire il path
        const parentFolder = await Folder.findByPk(folder.parent_id);
        if (parentFolder) {
            folder.path = `${parentFolder.path}/${folder.id}`;
        }
    }

    await folder.save();

    // Aggiorna ricorsivamente il path di tutte le sottocartelle
    const subFolders = await Folder.findAll({
        where: { parent_id: folder.id }
    });

    for (const subFolder of subFolders) {
        subFolder.path = `${folder.path}/${subFolder.id}`;
        await subFolder.save();
        await updateFolderPath(subFolder); // Aggiorna ricorsivamente
    }
};

/**
 * Ottiene tutti i discendenti di una cartella
 * @param {string} folderId - ID della cartella
 * @returns {Promise<Array>} Lista di tutte le sottocartelle a qualsiasi livello
 */
const getAllDescendants = async (folderId) => {
    const folder = await Folder.findByPk(folderId);
    if (!folder) return [];

    // Cerca tutte le cartelle che hanno un path che inizia con il path della cartella corrente
    const descendants = await Folder.findAll({
        where: {
            path: {
                [Op.like]: `${folder.path}/%`
            }
        }
    });

    return descendants;
};

/**
 * Ottiene il percorso breadcrumb di una cartella
 * @param {string} folderId - ID della cartella
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @returns {Promise<Array>} Percorso breadcrumb (array di cartelle)
 */
const getFolderBreadcrumb = async (folderId, userId) => {
    // Verifica che la cartella esista e appartenga all'utente
    const folder = await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });

    if (!folder) {
        throw new Error('Cartella non trovata o non accessibile');
    }

    // Se non ha un path, restituisci solo la cartella corrente
    if (!folder.path) {
        return [folder];
    }

    // Estrai gli ID dal path
    const folderIds = folder.path.split('/');

    // Ottieni tutte le cartelle nel percorso
    const breadcrumb = await Folder.findAll({
        where: {
            id: {
                [Op.in]: folderIds
            },
            user_id: userId
        },
        order: [
            [db.sequelize.literal(`ARRAY_POSITION(ARRAY[${folderIds.map(id => `'${id}'`).join(',')}]::uuid[], id)`)]
        ]
    });

    return breadcrumb;
};

/**
 * Ottiene il contenuto di una cartella (chat e allegati)
 * @param {string} folderId - ID della cartella
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @returns {Promise<Object>} Contenuto della cartella
 */
const getFolderContents = async (folderId, userId) => {
    // Verifica che la cartella esista e appartenga all'utente
    const folder = await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });

    if (!folder) {
        throw new Error('Cartella non trovata o non accessibile');
    }

    // Ottieni le sottocartelle
    const subFolders = await Folder.findAll({
        where: {
            parent_id: folderId,
            user_id: userId
        },
        order: [['name', 'ASC']]
    });

    // Ottieni le chat associate alla cartella
    const chats = await Chat.findAll({
        include: [
            {
                model: Folder,
                where: { id: folderId },
                through: { attributes: [] }
            },
            {
                association: 'sharedUsers',
                attributes: [],
                through: {
                    attributes: ['is_pinned'],
                    where: { user_id: userId }
                },
                required: false
            }
        ],
        order: [['last_message_at', 'DESC']]
    });

    // Add is_pinned to each chat
    const chatsWithPinned = chats.map(chat => {
        let isPinned = false;
        if (chat.sharedUsers && chat.sharedUsers.length > 0 && chat.sharedUsers[0].user_chats) {
            isPinned = chat.sharedUsers[0].user_chats.is_pinned;
        }
        return { ...chat.toJSON(), is_pinned: isPinned };
    });

    // Ottieni gli allegati associati alla cartella
    const attachments = await Attachment.findAll({
        include: [
            {
                model: Folder,
                where: { id: folderId },
                through: { attributes: [] }
            }
        ],
        order: [['created_at', 'DESC']]
    });

    return {
        folder,
        subFolders,
        chats: chatsWithPinned,
        attachments
    };
};

/**
 * Aggiunge una chat a una cartella
 * @param {string} folderId - ID della cartella
 * @param {number} chatId - ID della chat
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @returns {Promise<boolean>} true se aggiunta correttamente
 */
const addChatToFolder = async (folderId, chatId, userId) => {
    // Verifica che la cartella esista e appartenga all'utente
    const folder = await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });

    if (!folder) {
        throw new Error('Cartella non trovata o non accessibile');
    }

    // Verifica che la chat esista e che l'utente abbia accesso
    const chat = await Chat.findOne({
        where: { id: chatId },
        include: [
            {
                model: User,
                as: 'owner',
                where: { id: userId }
            }
        ]
    });

    if (!chat) {
        // Controlla se l'utente ha accesso alla chat condivisa
        const sharedChat = await Chat.findOne({
            where: { id: chatId },
            include: [
                {
                    model: User,
                    as: 'sharedUsers',
                    where: { id: userId },
                    through: { attributes: [] }
                }
            ]
        });

        if (!sharedChat) {
            throw new Error('Chat non trovata o non accessibile');
        }
    }

    // Aggiungi la chat alla cartella
    await db.sequelize.models.folder_chats.findOrCreate({
        where: {
            folder_id: folderId,
            chat_id: chatId
        },
        defaults: {
            folder_id: folderId,
            chat_id: chatId
        }
    });

    return true;
};

/**
 * Rimuove una chat da una cartella
 * @param {string} folderId - ID della cartella
 * @param {number} chatId - ID della chat
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @returns {Promise<boolean>} true se rimossa correttamente
 */
const removeChatFromFolder = async (folderId, chatId, userId) => {
    // Verifica che la cartella esista e appartenga all'utente
    const folder = await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });

    if (!folder) {
        throw new Error('Cartella non trovata o non accessibile');
    }

    // Rimuovi la chat dalla cartella
    await db.sequelize.models.folder_chats.destroy({
        where: {
            folder_id: folderId,
            chat_id: chatId
        }
    });

    return true;
};

/**
 * Aggiunge un allegato a una cartella
 * @param {string} folderId - ID della cartella
 * @param {number} attachmentId - ID dell'allegato
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @returns {Promise<boolean>} true se aggiunto correttamente
 */
const addAttachmentToFolder = async (folderId, attachmentId, userId) => {
    // Verifica che la cartella esista e appartenga all'utente
    const folder = await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });

    if (!folder) {
        throw new Error('Cartella non trovata o non accessibile');
    }

    // Verifica che l'allegato esista e che l'utente abbia accesso
    const attachment = await Attachment.findOne({
        where: {
            id: attachmentId,
            user_id: userId
        }
    });

    if (!attachment) {
        throw new Error('Allegato non trovato o non accessibile');
    }

    // Aggiungi l'allegato alla cartella
    await db.sequelize.models.folder_attachments.findOrCreate({
        where: {
            folder_id: folderId,
            attachment_id: attachmentId
        },
        defaults: {
            folder_id: folderId,
            attachment_id: attachmentId
        }
    });

    return true;
};

/**
 * Rimuove un allegato da una cartella
 * @param {string} folderId - ID della cartella
 * @param {number} attachmentId - ID dell'allegato
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @returns {Promise<boolean>} true se rimosso correttamente
 */
const removeAttachmentFromFolder = async (folderId, attachmentId, userId) => {
    // Verifica che la cartella esista e appartenga all'utente
    const folder = await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });

    if (!folder) {
        throw new Error('Cartella non trovata o non accessibile');
    }

    // Rimuovi l'allegato dalla cartella
    await db.sequelize.models.folder_attachments.destroy({
        where: {
            folder_id: folderId,
            attachment_id: attachmentId
        }
    });

    return true;
};

/**
 * Imposta o rimuove il pin su una folder
 * @param {string} folderId - ID della folder
 * @param {string} userId - ID dell'utente (per autorizzazione)
 * @param {boolean} value - true per pin, false per unpin
 * @returns {Promise<Object>} Folder aggiornata
 */
const setPinned = async (folderId, userId, value) => {
    const folder = await Folder.findOne({
        where: {
            id: folderId,
            user_id: userId
        }
    });
    if (!folder) {
        throw new Error('Cartella non trovata o non accessibile');
    }
    folder.is_pinned = value;
    await folder.save();
    return folder;
};

module.exports = {
    getUserFolders,
    getRootFolders,
    getSubFolders,
    getFolder,
    createFolder,
    updateFolder,
    deleteFolder,
    getFolderBreadcrumb,
    getFolderContents,
    addChatToFolder,
    removeChatFromFolder,
    addAttachmentToFolder,
    removeAttachmentFromFolder,
    setPinned
}; 