/**
 * Router per la gestione delle cartelle
 * @module api/v1/folders
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const folderService = require('../../services/folder.service');

/**
 * @swagger
 * tags:
 *   name: Folders
 *   description: API per la gestione delle cartelle
 */

/**
 * @swagger
 * /api/v1/folders:
 *   get:
 *     summary: Ottiene tutte le cartelle dell'utente
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista di cartelle
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       parent_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       is_default:
 *                         type: boolean
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const folders = await folderService.getUserFolders(userId);

        res.status(200).json({
            success: true,
            data: folders
        });
    } catch (error) {
        console.error('Errore nel recupero delle cartelle:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero delle cartelle'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/root:
 *   get:
 *     summary: Ottiene le cartelle root dell'utente (senza cartella padre)
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista di cartelle root
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       is_default:
 *                         type: boolean
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/root', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const rootFolders = await folderService.getRootFolders(userId);

        res.status(200).json({
            success: true,
            data: rootFolders
        });
    } catch (error) {
        console.error('Errore nel recupero delle cartelle root:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero delle cartelle root'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/subfolders:
 *   get:
 *     summary: Ottiene le sottocartelle di una cartella specifica
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *     responses:
 *       200:
 *         description: Lista di sottocartelle
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       parent_id:
 *                         type: string
 *                         format: uuid
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella non trovata
 *       500:
 *         description: Errore del server
 */
router.get('/:folderId/subfolders', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId } = req.params;

        // Verifica che la cartella esista e appartenga all'utente
        const folder = await folderService.getFolder(folderId, userId);
        if (!folder) {
            return res.status(404).json({
                success: false,
                error: 'Cartella non trovata'
            });
        }

        const subFolders = await folderService.getSubFolders(folderId);

        res.status(200).json({
            success: true,
            data: subFolders
        });
    } catch (error) {
        console.error('Errore nel recupero delle sottocartelle:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero delle sottocartelle'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}:
 *   get:
 *     summary: Ottiene i dettagli di una cartella specifica
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *     responses:
 *       200:
 *         description: Dettagli della cartella
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     parent_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     is_default:
 *                       type: boolean
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella non trovata
 *       500:
 *         description: Errore del server
 */
router.get('/:folderId', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId } = req.params;

        const folder = await folderService.getFolder(folderId, userId);
        if (!folder) {
            return res.status(404).json({
                success: false,
                error: 'Cartella non trovata'
            });
        }

        res.status(200).json({
            success: true,
            data: folder
        });
    } catch (error) {
        console.error('Errore nel recupero della cartella:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero della cartella'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders:
 *   post:
 *     summary: Crea una nuova cartella
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               parent_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Cartella creata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     parent_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, parent_id } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Il nome della cartella è obbligatorio'
            });
        }

        const folderData = {
            name,
            user_id: userId,
            parent_id: parent_id || null
        };

        const folder = await folderService.createFolder(folderData);

        res.status(201).json({
            success: true,
            data: folder
        });
    } catch (error) {
        console.error('Errore nella creazione della cartella:', error);

        if (error.message.includes('non trovata') || error.message.includes('non accessibile')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore nella creazione della cartella'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}:
 *   put:
 *     summary: Aggiorna una cartella esistente
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               parent_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Cartella aggiornata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     parent_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella non trovata
 *       500:
 *         description: Errore del server
 */
router.put('/:folderId', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId } = req.params;
        const { name, parent_id } = req.body;

        if (!name && parent_id === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Nessun dato da aggiornare'
            });
        }

        const folderData = {};
        if (name) folderData.name = name;
        if (parent_id !== undefined) folderData.parent_id = parent_id;

        const folder = await folderService.updateFolder(folderId, folderData, userId);

        res.status(200).json({
            success: true,
            data: folder
        });
    } catch (error) {
        console.error('Errore nell\'aggiornamento della cartella:', error);

        if (error.message.includes('non trovata') || error.message.includes('non accessibile')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        if (error.message.includes('ciclo')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore nell\'aggiornamento della cartella'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}:
 *   delete:
 *     summary: Elimina una cartella
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *     responses:
 *       200:
 *         description: Cartella eliminata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella non trovata
 *       500:
 *         description: Errore del server
 */
router.delete('/:folderId', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId } = req.params;

        await folderService.deleteFolder(folderId, userId);

        res.status(200).json({
            success: true
        });
    } catch (error) {
        console.error('Errore nell\'eliminazione della cartella:', error);

        if (error.message.includes('non trovata') || error.message.includes('non accessibile')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        if (error.message.includes('predefinita')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore nell\'eliminazione della cartella'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/breadcrumb:
 *   get:
 *     summary: Ottiene il percorso breadcrumb di una cartella
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *     responses:
 *       200:
 *         description: Percorso breadcrumb
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella non trovata
 *       500:
 *         description: Errore del server
 */
router.get('/:folderId/breadcrumb', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId } = req.params;

        const breadcrumb = await folderService.getFolderBreadcrumb(folderId, userId);

        res.status(200).json({
            success: true,
            data: breadcrumb
        });
    } catch (error) {
        console.error('Errore nel recupero del breadcrumb:', error);

        if (error.message.includes('non trovata') || error.message.includes('non accessibile')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore nel recupero del breadcrumb'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/breadcrumb-full:
 *   get:
 *     summary: Ottiene la gerarchia completa dalla root alla cartella corrente (breadcrumb completo)
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *     responses:
 *       200:
 *         description: Percorso breadcrumb completo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella non trovata
 *       500:
 *         description: Errore del server
 */
router.get('/:folderId/breadcrumb-full', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId } = req.params;

        // Recupera la gerarchia completa dalla root alla cartella corrente
        let current = await folderService.getFolder(folderId, userId);
        if (!current) {
            return res.status(404).json({ success: false, error: 'Cartella non trovata' });
        }
        const breadcrumb = [];
        while (current) {
            breadcrumb.unshift({ id: current.id, name: current.name });
            if (!current.parent_id) break;
            current = await folderService.getFolder(current.parent_id, userId);
        }
        // Aggiungi la root (Workspace) se non presente
        if (!breadcrumb[0] || breadcrumb[0].id !== null) {
            breadcrumb.unshift({ id: null, name: 'Workspace' });
        }
        res.status(200).json({ success: true, data: breadcrumb });
    } catch (error) {
        console.error('Errore nel recupero del breadcrumb completo:', error);
        res.status(500).json({ success: false, error: 'Errore nel recupero del breadcrumb completo' });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/contents:
 *   get:
 *     summary: Ottiene il contenuto di una cartella (sottocartelle, chat e allegati)
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *     responses:
 *       200:
 *         description: Contenuto della cartella
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     folder:
 *                       type: object
 *                     subFolders:
 *                       type: array
 *                       items:
 *                         type: object
 *                     chats:
 *                       type: array
 *                       items:
 *                         type: object
 *                     attachments:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella non trovata
 *       500:
 *         description: Errore del server
 */
router.get('/:folderId/contents', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId } = req.params;

        const contents = await folderService.getFolderContents(folderId, userId);

        res.status(200).json({
            success: true,
            data: contents
        });
    } catch (error) {
        console.error('Errore nel recupero del contenuto della cartella:', error);

        if (error.message.includes('non trovata') || error.message.includes('non accessibile')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore nel recupero del contenuto della cartella'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/chats/{chatId}:
 *   post:
 *     summary: Aggiunge una chat a una cartella
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *     responses:
 *       200:
 *         description: Chat aggiunta alla cartella con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella o chat non trovata
 *       500:
 *         description: Errore del server
 */
router.post('/:folderId/chats/:chatId', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId, chatId } = req.params;

        await folderService.addChatToFolder(folderId, chatId, userId);

        res.status(200).json({
            success: true
        });
    } catch (error) {
        console.error('Errore nell\'aggiunta della chat alla cartella:', error);

        if (error.message.includes('non trovata') || error.message.includes('non accessibile')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore nell\'aggiunta della chat alla cartella'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/chats/{chatId}:
 *   delete:
 *     summary: Rimuove una chat da una cartella
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *     responses:
 *       200:
 *         description: Chat rimossa dalla cartella con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella non trovata
 *       500:
 *         description: Errore del server
 */
router.delete('/:folderId/chats/:chatId', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId, chatId } = req.params;

        await folderService.removeChatFromFolder(folderId, chatId, userId);

        res.status(200).json({
            success: true
        });
    } catch (error) {
        console.error('Errore nella rimozione della chat dalla cartella:', error);

        if (error.message.includes('non trovata') || error.message.includes('non accessibile')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore nella rimozione della chat dalla cartella'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/attachments/{attachmentId}:
 *   post:
 *     summary: Aggiunge un allegato a una cartella
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *       - in: path
 *         name: attachmentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID dell'allegato
 *     responses:
 *       200:
 *         description: Allegato aggiunto alla cartella con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella o allegato non trovato
 *       500:
 *         description: Errore del server
 */
router.post('/:folderId/attachments/:attachmentId', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId, attachmentId } = req.params;

        await folderService.addAttachmentToFolder(folderId, attachmentId, userId);

        res.status(200).json({
            success: true
        });
    } catch (error) {
        console.error('Errore nell\'aggiunta dell\'allegato alla cartella:', error);

        if (error.message.includes('non trovata') || error.message.includes('non accessibile') ||
            error.message.includes('non trovato')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore nell\'aggiunta dell\'allegato alla cartella'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/attachments/{attachmentId}:
 *   delete:
 *     summary: Rimuove un allegato da una cartella
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della cartella
 *       - in: path
 *         name: attachmentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID dell'allegato
 *     responses:
 *       200:
 *         description: Allegato rimosso dalla cartella con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Cartella non trovata
 *       500:
 *         description: Errore del server
 */
router.delete('/:folderId/attachments/:attachmentId', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId, attachmentId } = req.params;

        await folderService.removeAttachmentFromFolder(folderId, attachmentId, userId);

        res.status(200).json({
            success: true
        });
    } catch (error) {
        console.error('Errore nella rimozione dell\'allegato dalla cartella:', error);

        if (error.message.includes('non trovata') || error.message.includes('non accessibile')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore nella rimozione dell\'allegato dalla cartella'
        });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/pin:
 *   post:
 *     summary: Pin una folder per l'utente autenticato
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della folder da pinnare
 *     responses:
 *       200:
 *         description: Folder pinnata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Folder non trovata
 *       500:
 *         description: Errore del server
 */
router.post('/:folderId/pin', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId } = req.params;
        const folder = await folderService.getFolder(folderId, userId);
        if (!folder) {
            return res.status(404).json({ success: false, error: 'Folder non trovata' });
        }
        await folderService.setPinned(folderId, userId, true);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Errore nel pin della folder:', error);
        res.status(500).json({ success: false, error: 'Errore nel pin della folder' });
    }
});

/**
 * @swagger
 * /api/v1/folders/{folderId}/pin:
 *   delete:
 *     summary: Unpin una folder per l'utente autenticato
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID della folder da unpinnare
 *     responses:
 *       200:
 *         description: Folder unpinnata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Folder non trovata
 *       500:
 *         description: Errore del server
 */
router.delete('/:folderId/pin', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId } = req.params;
        const folder = await folderService.getFolder(folderId, userId);
        if (!folder) {
            return res.status(404).json({ success: false, error: 'Folder non trovata' });
        }
        await folderService.setPinned(folderId, userId, false);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Errore nell\'unpin della folder:', error);
        res.status(500).json({ success: false, error: 'Errore nell\'unpin della folder' });
    }
});

module.exports = router; 