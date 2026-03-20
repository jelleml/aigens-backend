/**
 * Router per la gestione degli accessi utente
 * @module api/v1/user-accesses
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const userAccessService = require('../../services/user-access.service');

/**
 * @swagger
 * tags:
 *   name: UserAccesses
 *   description: API per la gestione degli accessi utente
 */

/**
 * @swagger
 * /api/v1/user-accesses:
 *   get:
 *     summary: Ottiene tutti gli accessi dell'utente attuale
 *     tags: [UserAccesses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Numero massimo di accessi da restituire
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Numero di accessi da saltare
 *     responses:
 *       200:
 *         description: Lista di accessi utente
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
 *                       device_type:
 *                         type: string
 *                         enum: [mobile, tablet, desktop]
 *                       browser:
 *                         type: string
 *                       operating_system:
 *                         type: string
 *                       ip_address:
 *                         type: string
 *                       accessed_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        const accesses = await userAccessService.getUserAccesses(userId, { limit, offset });

        res.status(200).json({
            success: true,
            data: accesses
        });
    } catch (error) {
        console.error('Errore nel recupero degli accessi utente:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero degli accessi utente'
        });
    }
});

/**
 * @swagger
 * /api/v1/user-accesses/stats:
 *   get:
 *     summary: Ottiene le statistiche sugli accessi dell'utente
 *     tags: [UserAccesses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistiche sugli accessi utente
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
 *                     total:
 *                       type: integer
 *                     deviceStats:
 *                       type: array
 *                       items:
 *                         type: object
 *                     browserStats:
 *                       type: array
 *                       items:
 *                         type: object
 *                     osStats:
 *                       type: array
 *                       items:
 *                         type: object
 *                     firstAccess:
 *                       type: string
 *                       format: date-time
 *                     lastAccess:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/stats', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const stats = await userAccessService.getUserAccessStats(userId);

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Errore nel recupero delle statistiche degli accessi:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero delle statistiche degli accessi'
        });
    }
});

/**
 * @swagger
 * /api/v1/user-accesses/{accessId}:
 *   get:
 *     summary: Ottiene i dettagli di un singolo accesso
 *     tags: [UserAccesses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID dell'accesso
 *     responses:
 *       200:
 *         description: Dettagli dell'accesso
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
 *                     device_type:
 *                       type: string
 *                       enum: [mobile, tablet, desktop]
 *                     browser:
 *                       type: string
 *                     operating_system:
 *                       type: string
 *                     ip_address:
 *                       type: string
 *                     accessed_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Accesso non trovato
 *       500:
 *         description: Errore del server
 */
router.get('/:accessId', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { accessId } = req.params;

        const access = await userAccessService.getUserAccess(accessId, userId);

        if (!access) {
            return res.status(404).json({
                success: false,
                error: 'Accesso non trovato'
            });
        }

        res.status(200).json({
            success: true,
            data: access
        });
    } catch (error) {
        console.error('Errore nel recupero dell\'accesso:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero dell\'accesso'
        });
    }
});

/**
 * @swagger
 * /api/v1/user-accesses/{accessId}:
 *   delete:
 *     summary: Elimina un accesso
 *     tags: [UserAccesses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID dell'accesso
 *     responses:
 *       200:
 *         description: Accesso eliminato con successo
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
 *         description: Accesso non trovato
 *       500:
 *         description: Errore del server
 */
router.delete('/:accessId', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { accessId } = req.params;

        const deleted = await userAccessService.deleteUserAccess(accessId, userId);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Accesso non trovato'
            });
        }

        res.status(200).json({
            success: true
        });
    } catch (error) {
        console.error('Errore nell\'eliminazione dell\'accesso:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nell\'eliminazione dell\'accesso'
        });
    }
});

/**
 * @swagger
 * /api/v1/user-accesses:
 *   delete:
 *     summary: Elimina tutti gli accessi dell'utente
 *     tags: [UserAccesses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Accessi eliminati con successo
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
 *                     count:
 *                       type: integer
 *                       description: Numero di accessi eliminati
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.delete('/', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const count = await userAccessService.deleteAllUserAccesses(userId);

        res.status(200).json({
            success: true,
            data: { count }
        });
    } catch (error) {
        console.error('Errore nell\'eliminazione degli accessi:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nell\'eliminazione degli accessi'
        });
    }
});

module.exports = router; 