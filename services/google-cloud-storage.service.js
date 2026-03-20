const { Storage } = require('@google-cloud/storage');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

class GoogleCloudBlobStorage {
    constructor() {
        // Validate AiGens configuration
        if (!config.googleCloud?.projectId || !config.googleCloud?.bucketName) {
            throw new Error('AiGens Google Cloud configuration is incomplete. Check your config file.');
        }

        console.log(`🔧 AiGens Storage config - Project ID: ${config.googleCloud.projectId}`);
        console.log(`🔧 AiGens Storage config - Bucket: ${config.googleCloud.bucketName}`);
        console.log(`🔧 AiGens Storage config - Client Email: ${config.googleCloud.credentials?.client_email || 'NOT SET'}`);

        // Initialize Storage with AiGens credentials
        this.storage = new Storage({
            projectId: config.googleCloud.projectId,
            credentials: config.googleCloud.credentials
        });

        this.bucketName = config.googleCloud.bucketName;
        this.bucket = this.storage.bucket(this.bucketName);
        this.config = config.googleCloud.storage || {};

        console.log(`✅ AiGens Storage initialized for project: ${config.googleCloud.projectId}`);
        console.log(`📦 Using bucket: ${this.bucketName}`);
    }

    /**
     * Upload file buffer to AiGens storage
     */
    async uploadFile(fileBuffer, fileName, options = {}) {
        try {
            const uploadOptions = {
                folder: options.folder || this.config.defaultFolder || 'uploads',
                makePublic: options.makePublic ?? this.config.publicRead ?? false,
                contentType: options.contentType,
                metadata: {
                    uploadedBy: 'aigens-app',
                    environment: process.env.NODE_ENV || 'development',
                    ...options.metadata
                }
            };

            // Validate file size
            if (this.config.maxFileSize && fileBuffer.length > this.config.maxFileSize) {
                throw new Error(`File size exceeds AiGens limit of ${this.config.maxFileSize} bytes`);
            }

            // Validate MIME type
            if (this.config.allowedMimeTypes && uploadOptions.contentType) {
                if (!this.config.allowedMimeTypes.includes(uploadOptions.contentType)) {
                    throw new Error(`File type ${uploadOptions.contentType} not allowed in AiGens app`);
                }
            }

            // Generate unique filename for AiGens
            const fileExtension = path.extname(fileName);
            const baseName = path.basename(fileName, fileExtension);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const uniqueFileName = `${baseName}-${timestamp}-${uuidv4().slice(0, 8)}${fileExtension}`;
            const filePath = uploadOptions.folder ? `${uploadOptions.folder}/${uniqueFileName}` : uniqueFileName;

            const file = this.bucket.file(filePath);

            // Ensure buffer is completely stable before upload
            if (!Buffer.isBuffer(fileBuffer)) {
                throw new Error('Invalid buffer provided for upload');
            }

            console.log(`Uploading buffer of size: ${fileBuffer.length} bytes`);

            // Use manual stream handling to avoid internal GCS library stream conflicts
            const stream = file.createWriteStream({
                metadata: {
                    contentType: uploadOptions.contentType || this.getContentType(fileName)
                },
                resumable: false,
                validation: false
            });

            // Handle stream events with proper cleanup
            const uploadPromise = new Promise((resolve, reject) => {
                let finished = false;

                const cleanup = () => {
                    if (!finished) {
                        finished = true;
                        stream.removeAllListeners();
                    }
                };

                stream.on('error', (error) => {
                    cleanup();
                    console.error('GCS stream error:', error);
                    reject(error);
                });

                stream.on('finish', () => {
                    cleanup();
                    console.log('GCS upload stream finished successfully');
                    resolve();
                });

                // Write data in chunks to avoid overwhelming the stream
                const chunkSize = 64 * 1024; // 64KB chunks
                let offset = 0;

                const writeChunk = () => {
                    if (offset >= fileBuffer.length) {
                        stream.end();
                        return;
                    }

                    const chunk = fileBuffer.slice(offset, Math.min(offset + chunkSize, fileBuffer.length));
                    const canContinue = stream.write(chunk);
                    offset += chunk.length;

                    if (canContinue) {
                        // Continue immediately if stream can handle more
                        setImmediate(writeChunk);
                    } else {
                        // Wait for drain event before continuing
                        stream.once('drain', writeChunk);
                    }
                };

                // Start writing
                setImmediate(writeChunk);
            });

            await uploadPromise;

            // Make public if requested
            let publicUrl = null;
            if (uploadOptions.makePublic) {
                await file.makePublic();
                publicUrl = `https://storage.googleapis.com/${this.bucketName}/${filePath}`;
            }

            // Get metadata
            const [metadata] = await file.getMetadata();

            return {
                success: true,
                fileName: uniqueFileName,
                filePath,
                originalName: fileName,
                size: metadata.size,
                contentType: metadata.contentType,
                publicUrl,
                gsUrl: `gs://${this.bucketName}/${filePath}`,
                downloadUrl: publicUrl || await this.getSignedUrl(filePath),
                uploadedAt: new Date().toISOString(),
                bucket: this.bucketName,
                aigensMetadata: {
                    environment: process.env.NODE_ENV,
                    version: 'v1.0'
                }
            };
        } catch (error) {
            console.error('AiGens upload file error:', error);
            throw new Error(`AiGens upload failed: ${error.message}`);
        }
    }

    /**
     * Upload file from path to AiGens storage (streaming upload)
     */
    async uploadFileFromPath(filePath, fileName, options = {}) {
        try {
            const fs = require('fs');
            const uploadOptions = {
                folder: options.folder || this.config.defaultFolder || 'uploads',
                makePublic: options.makePublic ?? this.config.publicRead ?? false,
                contentType: options.contentType,
                metadata: {
                    uploadedBy: 'aigens-app',
                    environment: process.env.NODE_ENV || 'development',
                    ...options.metadata
                }
            };

            // Validate file size
            const stats = await fs.promises.stat(filePath);
            if (this.config.maxFileSize && stats.size > this.config.maxFileSize) {
                throw new Error(`File size exceeds AiGens limit of ${this.config.maxFileSize} bytes`);
            }

            // Validate MIME type
            if (this.config.allowedMimeTypes && uploadOptions.contentType) {
                if (!this.config.allowedMimeTypes.includes(uploadOptions.contentType)) {
                    throw new Error(`File type ${uploadOptions.contentType} not allowed in AiGens app`);
                }
            }

            // Generate unique filename for AiGens
            const fileExtension = path.extname(fileName);
            const baseName = path.basename(fileName, fileExtension);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const uniqueFileName = `${baseName}-${timestamp}-${uuidv4().slice(0, 8)}${fileExtension}`;
            const filePathInBucket = uploadOptions.folder ? `${uploadOptions.folder}/${uniqueFileName}` : uniqueFileName;

            const file = this.bucket.file(filePathInBucket);
            const stream = file.createWriteStream({
                metadata: {
                    contentType: uploadOptions.contentType || this.getContentType(fileName),
                    metadata: {
                        originalName: fileName,
                        uploadedAt: new Date().toISOString(),
                        aigensApp: 'v1.0',
                        ...uploadOptions.metadata
                    }
                },
                resumable: false,
                validation: 'checksum'
            });

            return new Promise((resolve, reject) => {
                const readStream = fs.createReadStream(filePath);

                readStream.on('error', (error) => {
                    console.error('AiGens file read error:', error);
                    reject(new Error(`AiGens file read failed: ${error.message}`));
                });

                stream.on('error', (error) => {
                    console.error('AiGens upload error:', error);
                    reject(new Error(`AiGens upload failed: ${error.message}`));
                });

                stream.on('finish', async () => {
                    try {
                        let publicUrl = null;

                        if (uploadOptions.makePublic) {
                            await file.makePublic();
                            publicUrl = `https://storage.googleapis.com/${this.bucketName}/${filePathInBucket}`;
                        }

                        const [metadata] = await file.getMetadata();

                        resolve({
                            success: true,
                            fileName: uniqueFileName,
                            filePath: filePathInBucket,
                            originalName: fileName,
                            size: metadata.size,
                            contentType: metadata.contentType,
                            publicUrl,
                            gsUrl: `gs://${this.bucketName}/${filePathInBucket}`,
                            downloadUrl: publicUrl || await this.getSignedUrl(filePathInBucket),
                            uploadedAt: new Date().toISOString(),
                            bucket: this.bucketName,
                            aigensMetadata: {
                                environment: process.env.NODE_ENV,
                                version: 'v1.0'
                            }
                        });
                    } catch (error) {
                        reject(new Error(`Failed to get AiGens file metadata: ${error.message}`));
                    }
                });

                readStream.pipe(stream);
            });
        } catch (error) {
            console.error('AiGens upload from path error:', error);
            throw new Error(`AiGens upload from path failed: ${error.message}`);
        }
    }

    /**
     * Get signed URL for AiGens app
     */
    async getSignedUrl(filePath, options = {}) {
        try {
            const {
                action = 'read',
                expires = Date.now() + (this.config.signedUrlExpiration || 15 * 60 * 1000),
                contentType
            } = options;

            const file = this.bucket.file(filePath);
            const [exists] = await file.exists();

            if (!exists && action === 'read') {
                throw new Error(`AiGens file not found: ${filePath}`);
            }

            const signedUrlOptions = {
                version: 'v4',
                action,
                expires
            };

            if (contentType) {
                signedUrlOptions.contentType = contentType;
            }

            const [signedUrl] = await file.getSignedUrl(signedUrlOptions);
            return signedUrl;
        } catch (error) {
            console.error('AiGens signed URL error:', error);
            throw new Error(`Failed to generate AiGens signed URL: ${error.message}`);
        }
    }

    /**
     * Delete file from AiGens storage
     */
    async deleteFile(filePath) {
        try {
            const file = this.bucket.file(filePath);
            const [exists] = await file.exists();

            if (!exists) {
                console.warn(`AiGens file not found for deletion: ${filePath}`);
                return true;
            }

            await file.delete();
            console.log(`✅ AiGens file deleted: ${filePath}`);
            return true;
        } catch (error) {
            console.error('AiGens delete error:', error);
            throw new Error(`AiGens delete failed: ${error.message}`);
        }
    }

    /**
     * List files in AiGens storage
     */
    async listFiles(folder = '', options = {}) {
        try {
            const {
                maxResults = 1000,
                includeMetadata = false
            } = options;

            const listOptions = {
                prefix: folder ? `${folder}/` : '',
                maxResults
            };

            const [files] = await this.bucket.getFiles(listOptions);

            const fileList = await Promise.all(
                files.map(async (file) => {
                    const basicInfo = {
                        name: file.name,
                        bucket: file.bucket.name,
                        id: file.id,
                        aigensApp: true
                    };

                    if (includeMetadata) {
                        try {
                            const [metadata] = await file.getMetadata();
                            return {
                                ...basicInfo,
                                size: metadata.size,
                                contentType: metadata.contentType,
                                created: metadata.timeCreated,
                                updated: metadata.updated,
                                etag: metadata.etag,
                                aigensMetadata: metadata.metadata
                            };
                        } catch (error) {
                            console.warn(`Failed to get metadata for ${file.name}:`, error.message);
                            return basicInfo;
                        }
                    }

                    return basicInfo;
                })
            );

            return fileList;
        } catch (error) {
            console.error('AiGens list files error:', error);
            throw new Error(`Failed to list AiGens files: ${error.message}`);
        }
    }

    /**
     * Get AiGens storage info
     */
    getStorageInfo() {
        return {
            projectId: config.googleCloud.projectId,
            bucketName: this.bucketName,
            serviceAccount: 'aigens-storage-service@aigensapp-459209.iam.gserviceaccount.com',
            maxFileSize: this.config.maxFileSize,
            allowedMimeTypes: this.config.allowedMimeTypes,
            defaultFolder: this.config.defaultFolder,
            signedUrlExpiration: this.config.signedUrlExpiration,
            publicRead: this.config.publicRead,
            environment: process.env.NODE_ENV || 'development'
        };
    }

    /**
     * Validate file for AiGens app
     */
    validateFile(file) {
        const errors = [];

        if (this.config.maxFileSize && file.size > this.config.maxFileSize) {
            errors.push(`File size ${file.size} exceeds AiGens maximum of ${this.config.maxFileSize} bytes`);
        }

        if (this.config.allowedMimeTypes && !this.config.allowedMimeTypes.includes(file.mimetype)) {
            errors.push(`File type ${file.mimetype} not allowed in AiGens. Allowed: ${this.config.allowedMimeTypes.join(', ')}`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    getContentType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const contentTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.txt': 'text/plain',
            '.csv': 'text/csv',
            '.json': 'application/json'
        };

        return contentTypes[ext] || 'application/octet-stream';
    }

    /**
     * Download file from any bucket (for FileContentExtractorService)
     * @param {string} bucketName - Nome del bucket
     * @param {string} filePath - Percorso del file nel bucket
     * @returns {Promise<Buffer>} Buffer del file
     */
    async downloadFile(bucketName, filePath) {
        try {
            const bucket = this.storage.bucket(bucketName);
            const file = bucket.file(filePath);
            const [buffer] = await file.download();
            return buffer;
        } catch (error) {
            console.error(`AiGens download error for ${bucketName}/${filePath}:`, error);
            throw new Error(`Failed to download file from GCS: ${error.message}`);
        }
    }

    /**
     * Check if file exists in any bucket (for FileContentExtractorService)
     * @param {string} bucketName - Nome del bucket
     * @param {string} filePath - Percorso del file nel bucket
     * @returns {Promise<boolean>} True se il file esiste
     */
    async fileExists(bucketName, filePath) {
        try {
            const bucket = this.storage.bucket(bucketName);
            const file = bucket.file(filePath);
            const [exists] = await file.exists();
            return exists;
        } catch (error) {
            console.error(`AiGens file exists check error for ${bucketName}/${filePath}:`, error);
            throw new Error(`Failed to check file existence in GCS: ${error.message}`);
        }
    }
}

module.exports = GoogleCloudBlobStorage;