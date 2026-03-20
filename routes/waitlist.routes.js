/**
 * Routes per la gestione della lista d'attesa
 * @module routes/waitlist
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const waitlistController = require('../controllers/waitlist.controller');

const router = express.Router();

/**
 * Middleware per validare gli errori
 */
const validationError = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Errori di validazione',
            errors: errors.array()
        });
    }
    next();
};

/**
 * @swagger
 * /api/v1/waitlist/subscribe:
 *   post:
 *     summary: Aggiunge un'email alla lista d'attesa
 *     tags: [Waitlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email da aggiungere alla lista d'attesa
 *                 example: user@example.com
 *               firstname:
 *                 type: string
 *                 description: Nome del contatto (opzionale)
 *                 example: Mario
 *               lastname:
 *                 type: string
 *                 description: Cognome del contatto (opzionale)
 *                 example: Rossi
 *             required:
 *               - email
 *     responses:
 *       201:
 *         description: Email aggiunta con successo alla lista d'attesa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email user@example.com aggiunta con successo alla lista d'attesa
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       example: user@example.com
 *                     listName:
 *                       type: string
 *                       example: Aigens.io Waiting List
 *                     listId:
 *                       type: string
 *                       example: 159023
 *       400:
 *         description: Richiesta non valida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Email già presente nella lista
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: L'email è già presente nella lista d'attesa
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       example: user@example.com
 *       500:
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
    '/subscribe',
    [
        body('email')
            .isEmail()
            .withMessage('Email non valida'),
        body('firstname')
            .optional()
            .isString()
            .withMessage('Il nome deve essere una stringa')
            .trim(),
        body('lastname')
            .optional()
            .isString()
            .withMessage('Il cognome deve essere una stringa')
            .trim()
    ],
    validationError,
    waitlistController.addToWaitingList
);

/**
 * @swagger
 * /api/v1/waitlist/lists:
 *   get:
 *     summary: Recupera tutte le liste disponibili
 *     tags: [Waitlist]
 *     responses:
 *       200:
 *         description: Liste recuperate con successo
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
 *                       name:
 *                         type: string
 *       500:
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/lists', waitlistController.getLists);

module.exports = router; 