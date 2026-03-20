/**
 * Configurazione di Multer per la gestione degli upload di file
 * @module config/multer
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Assicura che la directory di upload esista
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Configurazione dello storage per Multer
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Crea una cartella specifica per il tipo di file se necessario
    let destFolder = uploadDir;
    
    if (file.mimetype.startsWith('image/')) {
      destFolder = path.join(uploadDir, 'images');
    } else if (file.mimetype.startsWith('video/')) {
      destFolder = path.join(uploadDir, 'videos');
    } else if (file.mimetype.startsWith('audio/')) {
      destFolder = path.join(uploadDir, 'audio');
    } else {
      destFolder = path.join(uploadDir, 'documents');
    }
    
    // Crea la cartella se non esiste
    if (!fs.existsSync(destFolder)) {
      fs.mkdirSync(destFolder, { recursive: true });
    }
    
    cb(null, destFolder);
  },
  filename: (req, file, cb) => {
    // Genera un nome file unico
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const fileExt = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${fileExt}`);
  }
});

/**
 * Filtro per i file consentiti
 */
const fileFilter = (req, file, cb) => {
  // Tipi MIME consentiti
  const allowedMimeTypes = [
    // Immagini
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    // Video
    'video/mp4', 'video/mpeg', 'video/quicktime',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    // Documenti
    'application/pdf', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo di file non supportato: ${file.mimetype}`), false);
  }
};

/**
 * Configurazione di Multer
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 5 // Massimo 5 file per richiesta
  }
});

/**
 * Middleware per gestire gli errori di Multer
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Errore di Multer
    return res.status(400).json({
      error: true,
      message: `Errore di upload: ${err.message}`
    });
  } else if (err) {
    // Altro errore
    return res.status(500).json({
      error: true,
      message: err.message
    });
  }
  
  next();
};

module.exports = {
  upload,
  handleMulterError,
  uploadDir
}; 