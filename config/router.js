/**
 * Configurazione del router per l'applicazione
 * @module config/router
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

/**
 * Carica dinamicamente tutti i file di routing dalla cartella API
 * @param {Express} app - Istanza dell'applicazione Express
 */
const setupRouter = (app) => {
  // Importa il router principale dell'API v1
  const apiV1Router = require('../api/v1');

  // Importa il router principale dell'API v2 (AI SDK compatible)
  const apiV2Router = require('../api/v2');

  // Registra il router principale dell'API v1
  app.use('/api/v1', apiV1Router);
  console.log('Router principale API v1 caricato');

  // Registra il router principale dell'API v2
  app.use('/api/v2', apiV2Router);
  console.log('Router principale API v2 caricato (AI SDK compatible)');

  // Importa e registra le rotte per i servizi AI
  try {
    // Rotte per Anthropic
    const anthropicRoutes = require('../routes/anthropic.routes');
    app.use('/api/v1/anthropic', anthropicRoutes);
    console.log('Router Anthropic caricato');

    // Rotte per Deepseek
    const deepseekRoutes = require('../routes/deepseek.routes');
    app.use('/api/v1/deepseek', deepseekRoutes);
    console.log('Router Deepseek caricato');

    // Rotte per OpenAI
    const openaiRoutes = require('../routes/openai.routes');
    app.use('/api/v1/openai', openaiRoutes);
    console.log('Router OpenAI caricato');

    // Rotte per Analytics
    const analyticsRoutes = require('../routes/analytics.routes');
    app.use('/api/v1/analytics', analyticsRoutes);
    console.log('Router Analytics caricato');

    // Rotte per Upload (gestione immagini)
    const uploadsRoutes = require('../routes/uploads.routes');
    app.use('/api/v1/uploads', uploadsRoutes);
    console.log('Router Uploads caricato');

    // Rotte per la lista d'attesa (Vbout)
    const waitlistRoutes = require('../routes/waitlist.routes');
    app.use('/api/v1/waitlist', waitlistRoutes);
    console.log('Router Waitlist caricato');

    // Rotte per OpenRouter
    const openrouterRoutes = require('../routes/openrouter.routes');
    app.use('/api/v1/openrouter', openrouterRoutes);
    console.log('Router OpenRouter caricato');

    // Rotte per la coda email
    const emailQueueRoutes = require('../api/v1/email-queue');
    app.use('/api/v1/email-queue', emailQueueRoutes);
    console.log('Router Email Queue caricato');
  } catch (error) {
    console.warn('Errore nel caricamento dei router:', error.message);
  }

  /**
   * @swagger
   * /api/health:
   *   get:
   *     summary: Verifica lo stato dell'API
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: API funzionante correttamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: ok
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   */
  // Rotta per verificare lo stato dell'API
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Gestione delle rotte non trovate
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint non trovato' });
  });
};

module.exports = {
  setupRouter
}; 