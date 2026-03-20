const openrouterService = require('../services/openrouter.service');
const { sequelize } = require('../database');
// COMMENTATO: Sistema di logging centralizzato
// const { getLogger } = require('../services/logging');
// const logger = getLogger('openrouter', 'controller');

class OpenRouterController {
    async handleRequest(req, res) {
        const transaction = await sequelize.transaction();
        try {
            const { model, prompt, attachments, chatId, userId } = req.body;
            if (!model || !prompt || !chatId || !userId) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Parametri mancanti: model, prompt, chatId e userId sono obbligatori'
                });
            }
            // Verifica che il modello sia supportato
            const isAvailable = await openrouterService.isModelAvailable(model);
            if (!isAvailable) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Modello non supportato: ${model}`
                });
            }
            // Processa la richiesta
            const response = await openrouterService.sendRequest(prompt, model, userId, chatId, 'chat', attachments);
            await transaction.commit();
            return res.status(200).json({
                success: true,
                data: response
            });
        } catch (error) {
            await transaction.rollback();
            if (error.message.includes('Fondi insufficienti')) {
                return res.status(402).json({
                    success: false,
                    message: error.message,
                    error: 'INSUFFICIENT_FUNDS'
                });
            }
            console.error('Errore durante la richiesta a OpenRouter:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Si è verificato un errore durante l\'elaborazione della richiesta'
            });
        }
    }

    async estimateCost(req, res) {
        try {
            const { model, prompt } = req.body;
            if (!model || !prompt) {
                return res.status(400).json({
                    success: false,
                    message: 'Parametri mancanti: model e prompt sono obbligatori'
                });
            }
            const estimatedTokens = Math.ceil(prompt.length / 4);
            const costEstimate = await openrouterService.calculateCost(model, estimatedTokens);
            return res.status(200).json({
                success: true,
                data: {
                    estimated_tokens: estimatedTokens,
                    cost_details: costEstimate
                }
            });
        } catch (error) {
            console.error('Errore durante la stima del costo:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Si è verificato un errore durante la stima del costo'
            });
        }
    }

    async checkFunds(req, res) {
        try {
            const { userId, estimatedCost } = req.body;
            if (!userId || estimatedCost === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Parametri mancanti: userId e estimatedCost sono obbligatori'
                });
            }
            const hasSufficientFunds = await openrouterService.checkUserFunds(userId, estimatedCost);
            return res.status(200).json({
                success: true,
                data: {
                    has_sufficient_funds: hasSufficientFunds
                }
            });
        } catch (error) {
            console.error('Errore durante la verifica dei fondi:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Si è verificato un errore durante la verifica dei fondi'
            });
        }
    }
}

module.exports = new OpenRouterController(); 