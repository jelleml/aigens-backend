/**
 * Router per la gestione degli utenti
 * @module api/v1/users
 */

const express = require('express');
const router = express.Router();
const { User, Wallet, UserSettings } = require('../../database').sequelize.models;

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: API per la gestione degli utenti
 */

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Ottiene la lista degli utenti
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista degli utenti recuperata con successo
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
 *                         type: integer
 *                       username:
 *                         type: string
 *                       email:
 *                         type: string
 *                       first_name:
 *                         type: string
 *                       last_name:
 *                         type: string
 *                       role:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/', async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] }
    });

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Errore nel recupero degli utenti:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero degli utenti'
    });
  }
});

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Ottiene un utente specifico
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID dell'utente
 *     responses:
 *       200:
 *         description: Utente recuperato con successo
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
 *                       type: integer
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     first_name:
 *                       type: string
 *                     last_name:
 *                       type: string
 *                     role:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     Wallet:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         balance:
 *                           type: number
 *                         currency:
 *                           type: string
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Utente non trovato
 *       500:
 *         description: Errore del server
 */
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Wallet }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Errore nel recupero dell\'utente:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dell\'utente'
    });
  }
});

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Crea un nuovo utente
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username dell'utente
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email dell'utente
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Password dell'utente
 *               first_name:
 *                 type: string
 *                 description: Nome dell'utente
 *               last_name:
 *                 type: string
 *                 description: Cognome dell'utente
 *     responses:
 *       201:
 *         description: Utente creato con successo
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
 *                       type: integer
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     first_name:
 *                       type: string
 *                     last_name:
 *                       type: string
 *                     role:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Dati non validi o utente già esistente
 *       500:
 *         description: Errore del server
 */
router.post('/', async (req, res) => {
  try {
    const { username, email, password, first_name, last_name } = req.body;

    // Verifica se l'utente esiste già
    const existingUser = await User.findOne({
      where: {
        [User.sequelize.Op.or]: [{ username }, { email }]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Username o email già in uso'
      });
    }

    // Crea il nuovo utente
    const user = await User.create({
      username,
      email,
      password,
      first_name,
      last_name
    });

    // Crea un wallet per l'utente
    await Wallet.create({
      user_id: user.id,
      currency: 'EUR'
    });

    // Crea le impostazioni utente di default
    await UserSettings.create({
      user_id: user.id,
      default_language: 'italian',
      auto_save_chats: false,
      enable_notifications: true,
      dark_mode: false,
      show_tooltips: true,
      efficiency: 50,
      quality: 50,
      speed: 50,
      syntheticity: 50,
      creativity: 50,
      scientificity: 50
    });

    // Rimuovi la password dalla risposta
    const userData = user.toJSON();
    delete userData.password;

    res.status(201).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Errore nella creazione dell\'utente:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella creazione dell\'utente'
    });
  }
});

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: Aggiorna un utente esistente
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID dell'utente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username dell'utente
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email dell'utente
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Password dell'utente
 *               first_name:
 *                 type: string
 *                 description: Nome dell'utente
 *               last_name:
 *                 type: string
 *                 description: Cognome dell'utente
 *     responses:
 *       200:
 *         description: Utente aggiornato con successo
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
 *                       type: integer
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     first_name:
 *                       type: string
 *                     last_name:
 *                       type: string
 *                     role:
 *                       type: string
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Utente non trovato
 *       500:
 *         description: Errore del server
 */
router.put('/:id', async (req, res) => {
  try {
    const { username, email, first_name, last_name, password } = req.body;

    // Trova l'utente
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    // Aggiorna i campi
    if (username) user.username = username;
    if (email) user.email = email;
    if (first_name) user.first_name = first_name;
    if (last_name) user.last_name = last_name;
    if (password) user.password = password;

    await user.save();

    // Rimuovi la password dalla risposta
    const userData = user.toJSON();
    delete userData.password;

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento dell\'utente:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'aggiornamento dell\'utente'
    });
  }
});

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Elimina un utente
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID dell'utente
 *     responses:
 *       200:
 *         description: Utente eliminato con successo
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
 *                   example: Utente eliminato con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Utente non trovato
 *       500:
 *         description: Errore del server
 */
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    await user.destroy();

    res.status(200).json({
      success: true,
      message: 'Utente eliminato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione dell\'utente:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'eliminazione dell\'utente'
    });
  }
});

module.exports = router; 