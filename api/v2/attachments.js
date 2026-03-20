/**
 * API v2 Attachments Endpoint
 * Handle file uploads for AI SDK compatibility
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const GoogleCloudStorage = require('../../services/google-cloud-storage.service');
const authMiddleware = require('../../middlewares/auth.middleware');
const { createLogger } = require('../../scripts/utils/error-handler');

const logger = createLogger('api-v2-attachments');
const gcsService = new GoogleCloudStorage();

// Configure multer for temporary file storage
const upload = multer({
    dest: 'uploads/temp/',
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5
    },
    fileFilter: (req, file, cb) => {
        // Allowed file types
        const allowedTypes = [
            // Images
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            // Documents
            'application/pdf', 'text/plain', 'text/markdown',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            // Data files
            'application/json', 'text/csv', 'application/xml',
            // Video (for video models)
            'video/mp4', 'video/mov', 'video/avi'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not supported`), false);
        }
    }
});

/**
 * Generate unique filename
 */
function generateUniqueFilename(originalName) {
    const ext = path.extname(originalName);
    const basename = path.basename(originalName, ext);
    const hash = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();

    return `${basename}_${timestamp}_${hash}${ext}`;
}

/**
 * Get file category based on mime type
 */
function getFileCategory(mimeType) {
    if (mimeType.startsWith('image/')) return 'images';
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'documents';
}

/**
 * @swagger
 * /api/v2/attachments/upload:
 *   post:
 *     summary: Upload file attachment for AI SDK compatibility
 *     tags: [Attachments v2]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload (max 10MB)
 *               chat_id:
 *                 type: string
 *                 description: Associated chat ID (optional)
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Attachment ID
 *                 name:
 *                   type: string
 *                   description: Original filename
 *                 contentType:
 *                   type: string
 *                   description: MIME type
 *                 size:
 *                   type: integer
 *                   description: File size in bytes
 *                 url:
 *                   type: string
 *                   description: Temporary access URL
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   description: URL expiration time
 *       400:
 *         description: Invalid file or request
 *       413:
 *         description: File too large
 *       415:
 *         description: Unsupported file type
 *       500:
 *         description: Upload failed
 */
router.post('/upload',
    authMiddleware.authenticate,
    upload.single('file'),
    async (req, res) => {
        const requestId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            const userId = req.user.id;
            const chatId = req.body.chat_id;
            const file = req.file;

            if (!file) {
                return res.status(400).json({
                    error: {
                        type: 'validation_error',
                        message: 'No file provided',
                        code: 'MISSING_FILE'
                    }
                });
            }

            logger.info('V2 API: File upload started', {
                requestId,
                userId,
                chatId,
                filename: file.originalname,
                size: file.size,
                mimeType: file.mimetype
            });

            // Generate unique filename for storage
            const uniqueFilename = generateUniqueFilename(file.originalname);
            const fileCategory = getFileCategory(file.mimetype);
            const gcsPath = `attachments/temp/${fileCategory}/${uniqueFilename}`;

            // Upload to Google Cloud Storage
            const uploadResult = await gcsService.uploadFile(file.path, gcsPath, {
                contentType: file.mimetype,
                metadata: {
                    originalName: file.originalname,
                    uploadedBy: userId.toString(),
                    chatId: chatId || 'unknown',
                    uploadedAt: new Date().toISOString()
                }
            });

            // Generate signed URL for temporary access (1 hour expiration)
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            const signedUrl = await gcsService.getSignedUrl(gcsPath, {
                action: 'read',
                expires: expiresAt,
                contentType: file.mimetype
            });

            // Clean up temporary file
            try {
                await fs.unlink(file.path);
            } catch (cleanupError) {
                logger.warn('Failed to clean up temporary file', {
                    path: file.path,
                    error: cleanupError.message
                });
            }

            // Prepare response
            const response = {
                id: `att_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
                name: file.originalname,
                contentType: file.mimetype,
                size: file.size,
                url: signedUrl,
                expiresAt: expiresAt.toISOString(),
                // Additional metadata
                category: fileCategory,
                gcsPath: gcsPath,
                uploadedAt: new Date().toISOString()
            };

            logger.info('V2 API: File upload completed', {
                requestId,
                attachmentId: response.id,
                gcsPath,
                size: file.size
            });

            res.json(response);

        } catch (error) {
            logger.error('V2 API: File upload failed', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            // Clean up temporary file on error
            if (req.file) {
                try {
                    await fs.unlink(req.file.path);
                } catch (cleanupError) {
                    logger.warn('Failed to clean up file after error', {
                        path: req.file.path
                    });
                }
            }

            // Handle specific error types
            let statusCode = 500;
            let errorType = 'internal_error';
            let errorCode = 'UPLOAD_ERROR';

            if (error.message.includes('File too large')) {
                statusCode = 413;
                errorType = 'file_too_large';
                errorCode = 'FILE_TOO_LARGE';
            } else if (error.message.includes('not supported')) {
                statusCode = 415;
                errorType = 'unsupported_file_type';
                errorCode = 'UNSUPPORTED_FILE_TYPE';
            }

            res.status(statusCode).json({
                error: {
                    type: errorType,
                    message: error.message,
                    code: errorCode
                }
            });
        }
    }
);

/**
 * @swagger
 * /api/v2/attachments/{attachmentId}:
 *   get:
 *     summary: Get attachment information
 *     tags: [Attachments v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attachmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Attachment ID
 *     responses:
 *       200:
 *         description: Attachment information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 contentType:
 *                   type: string
 *                 size:
 *                   type: integer
 *                 url:
 *                   type: string
 *                 expiresAt:
 *                   type: string
 *       404:
 *         description: Attachment not found
 */
router.get('/:attachmentId',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            const attachmentId = req.params.attachmentId;
            const userId = req.user.id;

            logger.info('V2 API: Attachment info requested', { attachmentId, userId });

            // TODO: Implement proper attachment retrieval from database
            // For now, return a placeholder response
            res.status(404).json({
                error: {
                    type: 'not_found',
                    message: 'Attachment not found or access denied',
                    code: 'ATTACHMENT_NOT_FOUND'
                }
            });

        } catch (error) {
            logger.error('V2 API: Failed to get attachment info', {
                attachmentId: req.params.attachmentId,
                error: error.message
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Failed to retrieve attachment information',
                    code: 'ATTACHMENT_INFO_ERROR'
                }
            });
        }
    }
);

/**
 * @swagger
 * /api/v2/attachments/{attachmentId}:
 *   delete:
 *     summary: Delete attachment
 *     tags: [Attachments v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attachmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Attachment ID
 *     responses:
 *       200:
 *         description: Attachment deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Attachment not found
 */
router.delete('/:attachmentId',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            const attachmentId = req.params.attachmentId;
            const userId = req.user.id;

            logger.info('V2 API: Attachment deletion requested', { attachmentId, userId });

            // TODO: Implement proper attachment deletion
            // This would involve:
            // 1. Finding the attachment in database
            // 2. Verifying user ownership
            // 3. Deleting from GCS
            // 4. Removing from database

            res.status(404).json({
                error: {
                    type: 'not_found',
                    message: 'Attachment not found or access denied',
                    code: 'ATTACHMENT_NOT_FOUND'
                }
            });

        } catch (error) {
            logger.error('V2 API: Failed to delete attachment', {
                attachmentId: req.params.attachmentId,
                error: error.message
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Failed to delete attachment',
                    code: 'ATTACHMENT_DELETE_ERROR'
                }
            });
        }
    }
);

// Handle multer errors
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        logger.error('Multer error occurred', { error: error.message, code: error.code });

        let statusCode = 400;
        let errorType = 'validation_error';
        let errorCode = 'UPLOAD_ERROR';

        if (error.code === 'LIMIT_FILE_SIZE') {
            statusCode = 413;
            errorType = 'file_too_large';
            errorCode = 'FILE_TOO_LARGE';
        } else if (error.code === 'LIMIT_FILE_COUNT') {
            statusCode = 400;
            errorType = 'too_many_files';
            errorCode = 'TOO_MANY_FILES';
        }

        return res.status(statusCode).json({
            error: {
                type: errorType,
                message: error.message,
                code: errorCode
            }
        });
    }

    next(error);
});

module.exports = router;
