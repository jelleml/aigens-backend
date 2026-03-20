const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const userSettingsService = require('../../services/user-settings.service');

/**
 * @swagger
 * tags:
 *   name: UserSettings
 *   description: API per la gestione delle impostazioni utente
 */

/**
 * @swagger
 * /api/v1/user-settings:
 *   get:
 *     summary: Ottiene le impostazioni dell'utente autenticato
 *     tags: [UserSettings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Impostazioni recuperate con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/UserSettings'
 *       404:
 *         description: Impostazioni non trovate
 *       401:
 *         description: Non autorizzato
 */
router.get('/', authMiddleware.authenticate, async (req, res) => {
    try {
        const settings = await userSettingsService.getByUserId(req.user.id);
        if (!settings) {
            return res.status(404).json({ success: false, error: 'Impostazioni non trovate' });
        }
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @swagger
 * /api/v1/user-settings:
 *   post:
 *     summary: Crea le impostazioni per l'utente autenticato
 *     tags: [UserSettings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserSettings'
 *     responses:
 *       201:
 *         description: Impostazioni create con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/UserSettings'
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 */
router.post('/', authMiddleware.authenticate, async (req, res) => {
    try {
        const settings = await userSettingsService.create(req.user.id, req.body);
        res.status(201).json({ success: true, data: settings });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * @swagger
 * /api/v1/user-settings:
 *   put:
 *     summary: Aggiorna le impostazioni dell'utente autenticato
 *     tags: [UserSettings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserSettings'
 *     responses:
 *       200:
 *         description: Impostazioni aggiornate con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/UserSettings'
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 */
router.put('/', authMiddleware.authenticate, async (req, res) => {
    try {
        const settings = await userSettingsService.update(req.user.id, req.body);
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * @swagger
 * /api/v1/user-settings:
 *   delete:
 *     summary: Elimina le impostazioni dell'utente autenticato
 *     tags: [UserSettings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Impostazioni eliminate con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Non autorizzato
 */
router.delete('/', authMiddleware.authenticate, async (req, res) => {
    try {
        await userSettingsService.delete(req.user.id);
        res.json({ success: true, message: 'Impostazioni eliminate con successo' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router; 