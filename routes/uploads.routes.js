/**
 * Router per la gestione dei file di upload
 * @module routes/uploads
 */

const express = require('express');
const router = express.Router();
const { serveImage } = require('../controllers/uploads.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * @swagger
 * /api/v1/uploads/images/{filename}:
 *   get:
 *     summary: Serve un'immagine generata dagli agenti AI
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome del file da servire
 *     responses:
 *       200:
 *         description: Immagine servita con successo
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Nome file mancante o non valido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Utente non autenticato
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Immagine non trovata
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Errore interno del server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Temporarily disable authentication for easier debugging
// TODO: Re-enable authentication for production
router.get('/images/:filename', serveImage);

// Production version (commented out during development)
// router.get('/images/:filename', authMiddleware.authenticate, serveImage);

module.exports = router; 