const anthropicService = require('../services/anthropic.service');
const { sequelize } = require('../database');
// COMMENTATO: Sistema di logging centralizzato
// const { getLogger } = require('../services/logging');
// const logger = getLogger('anthropic', 'controller');

/**
 * Controller per gestire le richieste ad Anthropic
 */
class AnthropicController {
  /**
   * Gestisce una richiesta ad Anthropic
   * @param {Object} req - Oggetto richiesta Express
   * @param {Object} res - Oggetto risposta Express
   */
  async handleRequest(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { model, prompt, attachments, chatId, userId } = req.body;

      // Validazione dei parametri richiesti
      if (!model || !prompt || !chatId || !userId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Parametri mancanti: model, prompt, chatId e userId sono obbligatori'
        });
      }

      // Verifica che il modello sia supportato
      const supportedModels = [
        'claude-3-opus',
        'claude-3-sonnet',
        'claude-3-haiku',
        'claude-3-5-sonnet',
        'claude-3-7-sonnet',
        'claude-3-7-sonnet-20250219',
        'claude-3-7-sonnet-latest'
      ];

      if (!supportedModels.includes(model)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Modello non supportato: ${model}. I modelli supportati sono: ${supportedModels.join(', ')}`
        });
      }

      // Processa la richiesta
      const response = await anthropicService.processAnthropicRequest({
        model,
        prompt,
        attachments,
        chatId,
        userId
      });

      await transaction.commit();

      return res.status(200).json({
        success: true,
        data: response
      });

    } catch (error) {
      await transaction.rollback();

      // Gestione specifica per errore di fondi insufficienti
      if (error.message.includes('Fondi insufficienti')) {
        return res.status(402).json({
          success: false,
          message: error.message,
          error: 'INSUFFICIENT_FUNDS'
        });
      }

      console.error('Errore durante la richiesta ad Anthropic:', error);

      return res.status(500).json({
        success: false,
        message: error.message || 'Si è verificato un errore durante l\'elaborazione della richiesta'
      });
    }
  }

  /**
   * Calcola una stima del costo di una richiesta
   * @param {Object} req - Oggetto richiesta Express
   * @param {Object} res - Oggetto risposta Express
   */
  async estimateCost(req, res) {
    try {
      const { model, prompt } = req.body;

      if (!model || !prompt) {
        return res.status(400).json({
          success: false,
          message: 'Parametri mancanti: model e prompt sono obbligatori'
        });
      }

      // Stima approssimativa dei token (in una implementazione reale, usare un tokenizer)
      const estimatedTokens = Math.ceil(prompt.length / 4);

      // Calcola il costo stimato
      const costEstimate = anthropicService.calculateCost(model, estimatedTokens);

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

  /**
   * Verifica se l'utente ha fondi sufficienti per una richiesta
   * @param {Object} req - Oggetto richiesta Express
   * @param {Object} res - Oggetto risposta Express
   */
  async checkFunds(req, res) {
    try {
      const { userId, estimatedCost } = req.body;

      if (!userId || estimatedCost === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Parametri mancanti: userId e estimatedCost sono obbligatori'
        });
      }

      // Verifica i fondi
      const hasSufficientFunds = await anthropicService.checkUserFunds(userId, estimatedCost);

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

module.exports = new AnthropicController(); 