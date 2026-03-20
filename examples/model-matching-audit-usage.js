const { ModelMatchingAudit } = require('../database/models');

/**
 * Esempio di utilizzo del modello ModelMatchingAudit
 * Questo file mostra come utilizzare il modello per tracciare le decisioni di matching dei modelli
 */

async function exampleUsage() {
  try {
    // 1. Creare un record di audit per un match esatto
    const exactMatchRecord = await ModelMatchingAudit.create({
      integrated_model_slug: 'gpt-4',
      aa_model_slug: 'gpt-4',
      match_type: 'exact_match',
      confidence_score: 1.00,
      tier_used: 1,
      reasoning: 'Exact match found in database - model slug matches exactly',
      processing_time_ms: 25,
      llm_used: false,
      alternatives_considered: null,
    });

    console.log('Exact match record created:', exactMatchRecord.id);

    // 2. Creare un record per un match fuzzy
    const fuzzyMatchRecord = await ModelMatchingAudit.create({
      integrated_model_slug: 'gpt-4-turbo-preview',
      aa_model_slug: 'gpt-4-turbo',
      match_type: 'fuzzy_match',
      confidence_score: 0.85,
      tier_used: 4,
      reasoning: 'Fuzzy match based on similarity score - model names are similar',
      processing_time_ms: 150,
      llm_used: false,
      alternatives_considered: [
        { slug: 'gpt-4-turbo', score: 0.85 },
        { slug: 'gpt-4', score: 0.70 },
        { slug: 'gpt-4o', score: 0.65 }
      ],
    });

    console.log('Fuzzy match record created:', fuzzyMatchRecord.id);

    // 3. Creare un record per un match assistito da LLM
    const llmAssistedRecord = await ModelMatchingAudit.create({
      integrated_model_slug: 'claude-3-sonnet',
      aa_model_slug: 'claude-3-sonnet-20240229',
      match_type: 'llm_assisted',
      confidence_score: 0.92,
      tier_used: 3,
      reasoning: 'LLM determined this is the best match based on model capabilities and family',
      processing_time_ms: 2500,
      llm_used: true,
      alternatives_considered: [
        { slug: 'claude-3-sonnet-20240229', score: 0.92, reason: 'Same model family, latest version' },
        { slug: 'claude-3-opus-20240229', score: 0.75, reason: 'Different model in same family' },
        { slug: 'claude-3-haiku-20240307', score: 0.60, reason: 'Different model in same family' }
      ],
    });

    console.log('LLM assisted record created:', llmAssistedRecord.id);

    // 4. Creare un record per nessun match trovato
    const noMatchRecord = await ModelMatchingAudit.create({
      integrated_model_slug: 'unknown-model-xyz',
      aa_model_slug: null,
      match_type: 'no_match',
      confidence_score: 0.00,
      tier_used: null,
      reasoning: 'No matching model found in database after all matching tiers were exhausted',
      processing_time_ms: 100,
      llm_used: false,
      alternatives_considered: [],
    });

    console.log('No match record created:', noMatchRecord.id);

    // 5. Query di esempio per analizzare i dati di audit
    const recentAudits = await ModelMatchingAudit.findAll({
      where: {
        created_at: {
          [require('sequelize').Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Ultime 24 ore
        }
      },
      order: [['created_at', 'DESC']],
      limit: 10
    });

    console.log('Recent audit records:', recentAudits.length);

    // 6. Statistiche sui tipi di match
    const matchTypeStats = await ModelMatchingAudit.findAll({
      attributes: [
        'match_type',
        [require('sequelize').fn('COUNT', '*'), 'count'],
        [require('sequelize').fn('AVG', require('sequelize').col('confidence_score')), 'avg_confidence'],
        [require('sequelize').fn('AVG', require('sequelize').col('processing_time_ms')), 'avg_processing_time']
      ],
      group: ['match_type'],
      order: [[require('sequelize').fn('COUNT', '*'), 'DESC']]
    });

    console.log('Match type statistics:', matchTypeStats);

    // 7. Trova record con bassa confidenza per analisi
    const lowConfidenceRecords = await ModelMatchingAudit.findAll({
      where: {
        confidence_score: {
          [require('sequelize').Op.lt]: 0.5
        }
      },
      order: [['confidence_score', 'ASC']],
      limit: 5
    });

    console.log('Low confidence records:', lowConfidenceRecords.length);

  } catch (error) {
    console.error('Error in example usage:', error);
  }
}

// Funzione per pulire i dati di esempio
async function cleanupExampleData() {
  try {
    await ModelMatchingAudit.destroy({
      where: {
        integrated_model_slug: {
          [require('sequelize').Op.in]: ['gpt-4', 'gpt-4-turbo-preview', 'claude-3-sonnet', 'unknown-model-xyz']
        }
      }
    });
    console.log('Example data cleaned up');
  } catch (error) {
    console.error('Error cleaning up example data:', error);
  }
}

module.exports = {
  exampleUsage,
  cleanupExampleData
};

// Esegui l'esempio se il file viene chiamato direttamente
if (require.main === module) {
  exampleUsage()
    .then(() => {
      console.log('Example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Example failed:', error);
      process.exit(1);
    });
} 