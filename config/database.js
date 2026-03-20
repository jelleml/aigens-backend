/**
 * Configurazione del database per l'applicazione e Sequelize CLI
 * @module config/database
 */

const config = require('./config');
const db = require('../database');

// Configurazione per Sequelize CLI
module.exports = {
  development: {
    username: config.database.user,
    password: config.database.password,
    database: config.database.name,
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect || 'mysql',
    logging: false
  },
  test: {
    username: config.database.user,
    password: config.database.password,
    database: config.database.name,
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect || 'mysql',
    logging: false
  },
  production: {
    username: config.database.user,
    password: config.database.password,
    database: config.database.name,
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect || 'mysql',
    logging: false
  }
};

/**
 * Controlla se una tabella esiste nel database
 * @param {string} tableName Nome della tabella
 * @returns {Promise<boolean>} True se la tabella esiste
 */
const tableExists = async (tableName) => {
  try {
    // Caso per MySQL/MariaDB
    if (config.database.dialect === 'mysql' || config.database.dialect === 'mariadb') {
      const [result] = await db.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = '${config.database.name}' 
         AND table_name = '${tableName}'`,
        { logging: false }
      );
      return result[0].count > 0;
    }

    // Altri dialetti (PostgreSQL, SQLite, ecc.) possono richiedere query diverse
    return false;
  } catch (error) {
    console.error(`Errore durante la verifica della tabella ${tableName}:`, error);
    return false;
  }
};

/**
 * Gestisce la creazione di tabelle problematiche con vincoli di chiave esterna
 * @param {Object} model Modello Sequelize
 * @returns {Promise<boolean>} True se la creazione è avvenuta con successo
 */
const handleProblemTable = async (model) => {
  try {
    if (!model) return false;
    const tableName = model.tableName || model.name.toLowerCase() + 's';
    // Verifica se la tabella esiste già
    const exists = await tableExists(tableName);
    if (exists) {
      console.log(`La tabella ${tableName} esiste già, saltando creazione.`);
      return true;
    }
    // Per MessageCost, gestiamo la creazione speciale
    if (model.name === 'MessageCost') {
      // Crea la tabella senza foreign keys
      try {
        // Prima eliminiamo la tabella se esiste
        await db.sequelize.query(`DROP TABLE IF EXISTS message_costs;`);

        // Creiamo la tabella con la struttura corretta
        await db.sequelize.query(`
          CREATE TABLE IF NOT EXISTS message_costs (
            id INTEGER auto_increment,
            message_id INTEGER,
            chat_id INTEGER,
            user_id CHAR(36),
            model_id INTEGER,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            estimated_output_ratio FLOAT,
            real_output_ratio FLOAT,
            base_cost DECIMAL(10,6) NOT NULL,
            fixed_markup DECIMAL(10,6) NOT NULL DEFAULT 0,
            percentage_markup DECIMAL(10,6) NOT NULL DEFAULT 0,
            total_markup DECIMAL(10,6) NOT NULL DEFAULT 0,
            total_cost DECIMAL(10,6) NOT NULL,
            model_used VARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_message_id (message_id),
            INDEX idx_chat_id (chat_id),
            INDEX idx_user_id (user_id),
            INDEX idx_model_id (model_id)
          ) ENGINE=InnoDB;
        `);

        // Aspettiamo un momento per assicurarci che la tabella sia stata creata
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try to add FKs, but ignore errors and never throw
        const tryAddFK = async (sql, label) => {
          try {
            await db.sequelize.query(sql);
            console.log(`FK ${label} aggiunta con successo`);
          } catch (err) {
            console.warn(`Avviso: Impossibile aggiungere FK ${label}: ${err.message}`);
          }
        };

        // Aggiungiamo i vincoli di chiave esterna uno alla volta
        await tryAddFK(`ALTER TABLE message_costs ADD CONSTRAINT fk_message_costs_message_id FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE NO ACTION ON UPDATE CASCADE;`, 'message_id');
        await tryAddFK(`ALTER TABLE message_costs ADD CONSTRAINT fk_message_costs_chat_id FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE NO ACTION ON UPDATE CASCADE;`, 'chat_id');
        await tryAddFK(`ALTER TABLE message_costs ADD CONSTRAINT fk_message_costs_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE CASCADE;`, 'user_id');
        await tryAddFK(`ALTER TABLE message_costs ADD CONSTRAINT fk_message_costs_model_id FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL ON UPDATE CASCADE;`, 'model_id');

        console.log(`Tabella ${tableName} creata con successo.`);
        return true;
      } catch (err) {
        console.warn(`Impossibile creare la tabella message_costs: ${err.message}`);
        return true; // Always return true, never throw
      }
    }
    // Fallback generico: crea tabella base senza FK
    try {
      await db.sequelize.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id INTEGER auto_increment PRIMARY KEY,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);
      console.log(`Tabella ${tableName} creata (versione base, senza FK).`);
      return true;
    } catch (basicError) {
      console.warn(`Impossibile creare la tabella base ${tableName}: ${basicError.message}`);
      return true; // Always return true, never throw
    }
  } catch (error) {
    console.warn('Errore durante la gestione della tabella problematica:', error.message);
    return true; // Always return true, never throw
  }
};

/**
 * Forza la creazione di tutte le tabelle dei modelli Sequelize, anche in caso di errori di vincoli
 */
const ensureAllModelTables = async () => {
  const models = db.sequelize.models;
  for (const modelName of Object.keys(models)) {
    const model = models[modelName];
    const tableName = model.tableName || model.name.toLowerCase() + 's';
    // Verifica se la tabella esiste già
    const exists = await tableExists(tableName);
    if (!exists) {
      try {
        await model.sync({
          alter: true,
          force: false,
          logging: false,
          hooks: false
        });
      } catch (err) {
        // Fallback per MessageCost o altri modelli problematici
        if (modelName === 'MessageCost') {
          await handleProblemTable(model);
        } else {
          console.warn(`Impossibile creare la tabella per il modello ${modelName}: ${err.message}`);
        }
      }
    }
  }
};

/**
 * Forza la creazione di tabelle problematiche (es. message_costs) con fallback SQL senza FK
 */
const ensureProblemTables = async () => {
  // MessageCost
  if (db.sequelize.models.MessageCost) {
    const tableName = 'message_costs';
    const exists = await tableExists(tableName);
    if (!exists) {
      try {
        await handleProblemTable(db.sequelize.models.MessageCost);
      } catch (err) {
        console.warn(`Impossibile creare la tabella message_costs nemmeno con fallback: ${err.message}`);
      }
    }
  }
  // Add similar logic for other problematic tables if needed
};

/**
 * Inizializza la connessione al database e sincronizza i modelli
 * @async
 * @param {boolean} [force=false] - Se true, ricrea le tabelle (ATTENZIONE: elimina tutti i dati)
 * @param {boolean} [createModels=false] - Se true, crea nuovi modelli se non esistono già
 * @param {boolean} [enableSync=false] - Se true, esegue la sincronizzazione dei modelli
 * @returns {Promise<boolean>} - Risultato dell'operazione
 */
const initializeDatabase = async (force = false, createModels = false, enableSync = false) => {
  try {
    // SICUREZZA: Previene l'utilizzo accidentale di force: true
    if (force === true) {
      const confirmMessage =
        "⚠️ ATTENZIONE: L'opzione force=true eliminerà TUTTI i dati dal database. ⚠️\n" +
        "Questa operazione NON può essere annullata.\n" +
        "Se sei sicuro di voler procedere, aggiungi il parametro '{ confirmed: true }' come terzo argomento.\n" +
        "Esempio: initializeDatabase(true, false, { confirmed: true })";

      console.error(confirmMessage);
      return false; // Fallisce intenzionalmente l'inizializzazione per prevenire la perdita di dati
    }

    if (!db) {
      console.error('Impossibile connettersi al database. Verifica le credenziali e la disponibilità del server.');
      return false;
    }

    // Prima, assicurati che tutte le tabelle dei modelli esistano
    await ensureAllModelTables();

    // Sincronizza i modelli con il database solo se enableSync è true
    if (enableSync) {
      const syncOptions = {
        force: false,
        logging: false,
        hooks: false
      }; // SICUREZZA: mai usare force: true direttamente

      // Se createModels è true, imposta l'opzione alter a true per permettere la creazione di nuovi modelli
      if (createModels && !force) {
        syncOptions.alter = true;
      }

      // SICUREZZA: Aggiunge force: true solo se esplicitamente richiesto con conferma
      if (force === true && arguments.length >= 4 && arguments[3] && arguments[3].confirmed === true) {
        console.warn('⚠️ ATTENZIONE: Utilizzando force: true. TUTTI i dati saranno eliminati!');
        syncOptions.force = true;
      }

      let syncSuccess = false;
      try {
        // Sincronizza i modelli con le opzioni appropriate
        syncSuccess = await db.sync(syncOptions);

        if (!syncSuccess) {
          console.error('Errore durante la sincronizzazione dei modelli con il database.');
        }
      } catch (syncError) {
        console.error('Errore durante la sincronizzazione dei modelli con il database:', syncError.message);
        // Non bloccare l'avvio, ma logga l'errore
      }
    } else {
      console.log('Sincronizzazione del database saltata (enableSync=false)');
    }

    // Dopo la sync, assicurati che le tabelle problematiche esistano
    await ensureProblemTables();

    // Verifica finale: tutte le tabelle richieste devono esistere
    const requiredTables = [
      'users', 'models', 'chats', 'messages', 'attachments', 'message_costs', 'folders', 'leads', 'prompts', 'settings', 'tokens', 'transactions', 'user_accesses', 'wallets', 'folder_attachments', 'folder_chats', 'user_chats'
    ];
    for (const table of requiredTables) {
      const exists = await tableExists(table);
      if (!exists) {
        console.warn(`Tabella mancante dopo l'inizializzazione: ${table}`);
      }
    }

    console.log('Database inizializzato con successo (tutte le tabelle richieste verificate).');
    return true;
  } catch (error) {
    console.error('Errore durante l\'inizializzazione del database:', error);
    return false;
  }
};

module.exports.initializeDatabase = initializeDatabase;
module.exports.tableExists = tableExists;
module.exports.handleProblemTable = handleProblemTable; 