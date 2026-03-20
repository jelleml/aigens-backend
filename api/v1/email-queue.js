const express = require('express');
const router = express.Router();
const EmailerService = require('../../services/emailer.service');

/**
 * GET /api/v1/email-queue/stats
 * Ottieni statistiche della coda email
 */
router.get('/stats', async (req, res) => {
    try {
        const emailer = new EmailerService({
            enableFallback: true,
            enableQueue: true
        });

        const stats = await emailer.getQueueStats();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Errore nel recupero statistiche coda:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero statistiche coda'
        });
    }
});

/**
 * POST /api/v1/email-queue/process
 * Processa le email in coda
 */
router.post('/process', async (req, res) => {
    try {
        const emailer = new EmailerService({
            enableFallback: true,
            enableQueue: true
        });

        // Mostra statistiche iniziali
        const initialStats = await emailer.getQueueStats();

        if (initialStats.totalQueued === 0) {
            return res.json({
                success: true,
                message: 'Nessuna email in coda da processare',
                data: {
                    processed: 0,
                    success: 0,
                    failure: 0,
                    initialStats,
                    finalStats: initialStats
                }
            });
        }

        // Processa le email in coda
        const results = await emailer.processQueuedEmails();

        // Calcola statistiche
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        // Statistiche finali
        const finalStats = await emailer.getQueueStats();

        res.json({
            success: true,
            message: `Processate ${results.length} email dalla coda`,
            data: {
                processed: results.length,
                success: successCount,
                failure: failureCount,
                results,
                initialStats,
                finalStats
            }
        });

    } catch (error) {
        console.error('Errore nel processamento coda:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel processamento della coda email'
        });
    }
});

/**
 * DELETE /api/v1/email-queue/clear
 * Svuota la coda email (solo per emergenze)
 */
router.delete('/clear', async (req, res) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');

        const queuePath = path.join(process.cwd(), 'temp', 'email-queue');

        // Verifica che la directory esista
        try {
            await fs.access(queuePath);
        } catch {
            return res.json({
                success: true,
                message: 'Coda già vuota',
                data: { cleared: 0 }
            });
        }

        // Leggi tutti i file nella coda
        const files = await fs.readdir(queuePath);
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        // Elimina tutti i file
        let clearedCount = 0;
        for (const file of jsonFiles) {
            try {
                await fs.unlink(path.join(queuePath, file));
                clearedCount++;
            } catch (error) {
                console.error(`Errore nell'eliminazione del file ${file}:`, error);
            }
        }

        res.json({
            success: true,
            message: `Coda svuotata: ${clearedCount} email eliminate`,
            data: { cleared: clearedCount }
        });

    } catch (error) {
        console.error('Errore nello svuotamento coda:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nello svuotamento della coda email'
        });
    }
});

module.exports = router; 