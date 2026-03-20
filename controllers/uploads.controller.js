/**
 * Controller per la gestione dei file di upload
 * @module controllers/uploads
 */

const fs = require('fs');
const path = require('path');
const { getLogger } = require('../services/logging');
const logger = getLogger('uploads', 'controller');

/**
 * Serve un'immagine dal file system verificando prima le autorizzazioni
 * @param {Object} req - Request Express
 * @param {Object} res - Response Express
 * @returns {Object} - Risposta con l'immagine o errore
 */
const serveImage = async (req, res) => {
    try {
        const { filename } = req.params;

        if (!filename) {
            return res.status(400).json({ error: 'Nome file mancante' });
        }

        // Verifica che il filename non contenga percorsi relativi per sicurezza
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ error: 'Nome file non valido' });
        }

        // Costruisce il percorso completo del file
        const imagePath = path.join(process.cwd(), 'uploads', 'images', filename);

        // Verifica che il file esista
        if (!fs.existsSync(imagePath)) {
            return res.status(404).json({ error: 'Immagine non trovata' });
        }

        // Determina il Content-Type in base all'estensione del file
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';

        switch (ext) {
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.gif':
                contentType = 'image/gif';
                break;
            case '.webp':
                contentType = 'image/webp';
                break;
            default:
                contentType = 'application/octet-stream';
        }

        // Imposta gli header appropriati per consentire l'accesso cross-origin
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache per 24 ore
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // Invia il file
        fs.createReadStream(imagePath).pipe(res);
    } catch (error) {
        logger.error('Errore durante il serving dell\'immagine:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
};

module.exports = {
    serveImage
}; 