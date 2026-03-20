const { sequelize } = require('../database');
const { QueryTypes } = require('sequelize');

/**
 * Migra la tabella message_costs aggiungendo i nuovi campi
 */
const migrateMessageCosts = async () => {
  try {
    console.log('Migrazione della tabella message_costs...');

    // Verifica se i campi esistono già
    const checkColumns = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'message_costs' 
      AND COLUMN_NAME IN ('model_id', 'estimated_output_ratio', 'real_output_ratio')
    `, { type: QueryTypes.SELECT });

    const existingColumns = checkColumns.map(col => col.COLUMN_NAME);

    // Aggiungi il campo model_id se non esiste
    if (!existingColumns.includes('model_id')) {
      console.log('Aggiunta del campo model_id...');
      await sequelize.query(`
        ALTER TABLE message_costs 
        ADD COLUMN model_id INT NULL,
        ADD CONSTRAINT fk_message_costs_model 
        FOREIGN KEY (model_id) REFERENCES models(id) 
        ON DELETE SET NULL
      `);
      console.log('Campo model_id aggiunto con successo.');
    } else {
      console.log('Il campo model_id esiste già.');
    }

    // Aggiungi il campo estimated_output_ratio se non esiste
    if (!existingColumns.includes('estimated_output_ratio')) {
      console.log('Aggiunta del campo estimated_output_ratio...');
      await sequelize.query(`
        ALTER TABLE message_costs 
        ADD COLUMN estimated_output_ratio FLOAT NULL
      `);
      console.log('Campo estimated_output_ratio aggiunto con successo.');
    } else {
      console.log('Il campo estimated_output_ratio esiste già.');
    }

    // Aggiungi il campo real_output_ratio se non esiste
    if (!existingColumns.includes('real_output_ratio')) {
      console.log('Aggiunta del campo real_output_ratio...');
      await sequelize.query(`
        ALTER TABLE message_costs 
        ADD COLUMN real_output_ratio FLOAT NULL
      `);
      console.log('Campo real_output_ratio aggiunto con successo.');
    } else {
      console.log('Il campo real_output_ratio esiste già.');
    }

    // Aggiorna i record esistenti collegandoli ai modelli corrispondenti
    console.log('Aggiornamento dei record esistenti...');

    // Ottieni tutti i messaggi che non hanno model_id ma hanno model_used
    const messageCosts = await sequelize.query(`
      SELECT id, model_used, input_tokens, output_tokens 
      FROM message_costs 
      WHERE model_id IS NULL AND model_used IS NOT NULL
    `, { type: QueryTypes.SELECT });

    console.log(`Trovati ${messageCosts.length} record da aggiornare.`);

    // Ottieni tutti i modelli dal database
    const models = await sequelize.query(`
      SELECT id, model_id FROM models
    `, { type: QueryTypes.SELECT });

    // Crea una mappa dei modelli per un accesso più veloce
    const modelMap = {};
    models.forEach(model => {
      modelMap[model.model_id] = model.id;
    });

    // Aggiorna ogni record
    let updatedCount = 0;
    for (const cost of messageCosts) {
      // Estrai il modello base (senza la data) se necessario
      let baseModel = cost.model_used;
      if (cost.model_used.includes('-20')) {
        if (cost.model_used.startsWith('claude-3-7-sonnet')) {
          baseModel = 'claude-3-7-sonnet';
        } else if (cost.model_used.startsWith('claude-3-5-sonnet')) {
          baseModel = 'claude-3-5-sonnet';
        } else {
          baseModel = cost.model_used.split('-20')[0];
        }
      }

      // Trova l'ID del modello
      const modelId = modelMap[baseModel] || modelMap[cost.model_used];

      if (modelId) {
        // Calcola il rapporto di output reale
        let realOutputRatio = null;
        if (cost.input_tokens > 0) {
          realOutputRatio = cost.output_tokens / cost.input_tokens;
        }

        // Aggiorna il record
        await sequelize.query(`
          UPDATE message_costs 
          SET model_id = :modelId, 
              real_output_ratio = :realOutputRatio 
          WHERE id = :id
        `, {
          replacements: {
            modelId,
            realOutputRatio,
            id: cost.id
          },
          type: QueryTypes.UPDATE
        });

        updatedCount++;
      }
    }

    console.log(`${updatedCount} record aggiornati con successo.`);

    // Chiudi la connessione al database
    // await sequelize.close();

    console.log('Migrazione completata con successo.');
  } catch (error) {
    console.error('Errore durante la migrazione:', error);
    process.exit(1);
  }
};

// Esegui lo script
migrateMessageCosts(); 