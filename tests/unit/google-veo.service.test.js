const googleVeoService = require('../../services/google-veo.service');
const db = require('../../database');

// Mock delle dipendenze
jest.mock('../../database', () => ({
    models: {
        Provider: {
            findOne: jest.fn()
        },
        Model: {
            findAll: jest.fn(),
            findByPk: jest.fn(),
            findOne: jest.fn()
        }
    },
    sequelize: {
        models: {
            User: {
                findOne: jest.fn()
            },
            Chat: {
                findOne: jest.fn()
            },
            Message: {
                create: jest.fn()
            },
            Attachment: {
                create: jest.fn()
            },
            Wallet: {
                findOne: jest.fn()
            },
            Transaction: {
                create: jest.fn()
            },
            MessageCost: {
                create: jest.fn()
            },
            Provider: {
                findOne: jest.fn()
            },
            ModelPriceScore: {
                findOne: jest.fn()
            }
        }
    }
}));

jest.mock('../../services/cost-calculator.service');
jest.mock('../../services/google-cloud-storage.service');
jest.mock('../../services/logging');

describe('Google Veo Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getGoogleVeoProviderId', () => {
        it('should return provider ID when provider exists', async () => {
            const mockProvider = { id: 1, name: 'google-veo' };
            db.models.Provider.findOne.mockResolvedValue(mockProvider);

            const result = await googleVeoService.getGoogleVeoProviderId();
            
            expect(result).toBe(1);
            expect(db.models.Provider.findOne).toHaveBeenCalledWith({
                where: { name: 'google-veo' }
            });
        });

        it('should throw error when provider not found', async () => {
            db.models.Provider.findOne.mockResolvedValue(null);

            await expect(googleVeoService.getGoogleVeoProviderId())
                .rejects.toThrow('Provider Google Veo non trovato');
        });
    });

    describe('fetchAvailableModels', () => {
        it('should return available models', async () => {
            const mockModels = [
                {
                    model_slug: 'google-veo-1.0',
                    name: 'Google Veo 1.0',
                    description: 'Test model',
                    max_tokens: 0,
                    capabilities: ['video-generation']
                }
            ];

            db.models.Model.findAll.mockResolvedValue(mockModels);
            db.models.Provider.findOne.mockResolvedValue({ id: 1 });

            const result = await googleVeoService.fetchAvailableModels();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('google-veo-1.0');
            expect(result[0].name).toBe('Google Veo 1.0');
        });

        it('should return empty array when no models found', async () => {
            db.models.Model.findAll.mockResolvedValue([]);
            db.models.Provider.findOne.mockResolvedValue({ id: 1 });

            const result = await googleVeoService.fetchAvailableModels();

            expect(result).toEqual([]);
        });
    });

    describe('calculateCost', () => {
        it('should calculate cost for valid model', async () => {
            const mockModel = {
                id: 1,
                name: 'Google Veo 1.0',
                provider: { name: 'google-veo' }
            };

            db.models.Model.findOne.mockResolvedValue(mockModel);

            const result = await googleVeoService.calculateCost(1, 1, 'Generate');

            expect(result).toHaveProperty('estimatedCost');
            expect(result).toHaveProperty('modelId');
            expect(result).toHaveProperty('modelName');
            expect(result.modelName).toBe('Google Veo 1.0');
        });

        it('should throw error for invalid model', async () => {
            db.models.Model.findOne.mockResolvedValue(null);

            await expect(googleVeoService.calculateCost(999, 1, 'Generate'))
                .rejects.toThrow('Model 999 not found');
        });
    });

    describe('checkUserFunds', () => {
        it('should return true when user has sufficient funds', async () => {
            const mockWallet = { balance: 10.0 };
            db.sequelize.models.Wallet.findOne.mockResolvedValue(mockWallet);

            const result = await googleVeoService.checkUserFunds(1, 5.0);

            expect(result).toBe(true);
        });

        it('should return false when user has insufficient funds', async () => {
            const mockWallet = { balance: 1.0 };
            db.sequelize.models.Wallet.findOne.mockResolvedValue(mockWallet);

            const result = await googleVeoService.checkUserFunds(1, 5.0);

            expect(result).toBe(false);
        });

        it('should throw error when wallet not found', async () => {
            db.sequelize.models.Wallet.findOne.mockResolvedValue(null);

            await expect(googleVeoService.checkUserFunds(1, 5.0))
                .rejects.toThrow('Wallet non trovato per l\'utente');
        });
    });

    describe('saveMessage', () => {
        it('should save message successfully', async () => {
            const mockMessage = { id: 1, content: 'Test message' };
            db.sequelize.models.Message.create.mockResolvedValue(mockMessage);

            const messageData = {
                chat_id: 1,
                user_id: 1,
                content: 'Test message',
                role: 'user'
            };

            const result = await googleVeoService.saveMessage(messageData);

            expect(result).toEqual(mockMessage);
            expect(db.sequelize.models.Message.create).toHaveBeenCalledWith(messageData);
        });
    });

    describe('saveAttachment', () => {
        it('should save attachment successfully', async () => {
            const mockAttachment = { id: 1, file_name: 'test.mp4' };
            db.sequelize.models.Attachment.create.mockResolvedValue(mockAttachment);

            const attachmentData = {
                message_id: 1,
                file_type: 'video',
                file_name: 'test.mp4'
            };

            const result = await googleVeoService.saveAttachment(attachmentData);

            expect(result).toEqual(mockAttachment);
            expect(db.sequelize.models.Attachment.create).toHaveBeenCalledWith(attachmentData);
        });
    });

    describe('isModelAvailable', () => {
        it('should return true for available model', async () => {
            const mockModels = [
                { id: 'google-veo-1.0', name: 'Google Veo 1.0' }
            ];

            // Mock fetchAvailableModels
            jest.spyOn(googleVeoService, 'fetchAvailableModels').mockResolvedValue(mockModels);

            const result = await googleVeoService.isModelAvailable('google-veo-1.0');

            expect(result).toBe(true);
        });

        it('should return false for unavailable model', async () => {
            const mockModels = [
                { id: 'google-veo-1.0', name: 'Google Veo 1.0' }
            ];

            jest.spyOn(googleVeoService, 'fetchAvailableModels').mockResolvedValue(mockModels);

            const result = await googleVeoService.isModelAvailable('google-veo-2.0');

            expect(result).toBe(false);
        });
    });
}); 