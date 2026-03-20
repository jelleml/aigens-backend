/**
 * Script per pulire indici duplicati dal database
 * Identifica e rimuove indici duplicati che possono causare errori nelle migrazioni
 */

const { Sequelize } = require('sequelize');
const config = require('../config/database.js');
const { getLogger } = require('../services/logging');

const logger = getLogger('migration', 'cleanup');

/**
 * Identifica indici duplicati in una tabella
 * @param {Array} indexes - Lista degli indici della tabella
 * @returns {Array} - Indici duplicati con informazioni dettagliate
 */
const findDuplicateIndexes = (indexes) => {
    const indexGroups = {};
    const duplicates = [];

    // Raggruppa indici per nome
    indexes.forEach(index => {
        if (!indexGroups[index.name]) {
            indexGroups[index.name] = [];
        }
        indexGroups[index.name].push(index);
    });

    // Identifica duplicati
    Object.entries(indexGroups).forEach(([name, group]) => {
        if (group.length > 1) {
            duplicates.push({
                name,
                count: group.length,
                indexes: group
            });
        }
    });

    return duplicates;
};

/**
 * Verifica se un indice è sicuro da rimuovere
 * @param {Object} index - Indice da verificare
 * @returns {boolean} - True se l'indice è sicuro da rimuovere
 */
const isIndexSafeToRemove = (index) => {
    // Non rimuovere indici primari
    if (index.primary) {
        return false;
    }

    // Non rimuovere indici unici
    if (index.unique) {
        return false;
    }

    // Non rimuovere indici con constraint
    if (index.constraintName) {
        return false;
    }

    return true;
};

/**
 * Rimuove un indice specifico da una tabella
 * @param {Sequelize} sequelize - Istanza Sequelize
 * @param {string} tableName - Nome della tabella
 * @param {string} indexName - Nome dell'indice da rimuovere
 * @returns {Promise<boolean>} - True se la rimozione è riuscita
 */
const removeIndex = async (sequelize, tableName, indexName) => {
    try {
        await sequelize.query(`DROP INDEX \`${indexName}\` ON \`${tableName}\``);
        logger.info(`✅ Indice ${indexName} rimosso da ${tableName}`);
        return true;
    } catch (error) {
        logger.error(`❌ Errore nella rimozione indice ${indexName} da ${tableName}:`, error.message);
        return false;
    }
};

/**
 * Pulisce gli indici duplicati di una tabella specifica
 * @param {Sequelize} sequelize - Istanza Sequelize
 * @param {string} tableName - Nome della tabella
 * @param {boolean} dryRun - Se true, mostra solo cosa verrebbe fatto senza eseguire
 * @returns {Promise<Object>} - Risultato della pulizia
 */
const cleanupTableIndexes = async (sequelize, tableName, dryRun = true) => {
    const result = {
        table: tableName,
        duplicatesFound: 0,
        indexesRemoved: 0,
        errors: [],
        dryRun
    };

    try {
        logger.info(`🔍 Analisi indici per tabella: ${tableName}`);

        // Recupera indici della tabella
        const indexes = await sequelize.showIndex(tableName);
        logger.info(`📊 Trovati ${indexes.length} indici in ${tableName}`);

        // Identifica duplicati
        const duplicates = findDuplicateIndexes(indexes);
        result.duplicatesFound = duplicates.length;

        if (duplicates.length === 0) {
            logger.info(`✅ Nessun indice duplicato trovato in ${tableName}`);
            return result;
        }

        logger.warn(`⚠️ Trovati ${duplicates.length} gruppi di indici duplicati in ${tableName}`);

        // Processa ogni gruppo di duplicati
        for (const duplicate of duplicates) {
            logger.info(`🔧 Processando gruppo duplicato: ${duplicate.name} (${duplicate.count} indici)`);

            // Mantieni il primo indice, rimuovi gli altri
            const indexesToRemove = duplicate.indexes.slice(1);

            for (const index of indexesToRemove) {
                if (!isIndexSafeToRemove(index)) {
                    logger.warn(`⚠️ Indice ${index.name} non sicuro da rimuovere (primary/unique/constraint), saltato`);
                    continue;
                }

                if (dryRun) {
                    logger.info(`🔍 [DRY RUN] Rimozione indice ${index.name} da ${tableName}`);
                } else {
                    const success = await removeIndex(sequelize, tableName, index.name);
                    if (success) {
                        result.indexesRemoved++;
                    } else {
                        result.errors.push(`Errore rimozione indice ${index.name} da ${tableName}`);
                    }
                }
            }
        }

    } catch (error) {
        logger.error(`❌ Errore nell'analisi indici per ${tableName}:`, error.message);
        result.errors.push(`Errore analisi ${tableName}: ${error.message}`);
    }

    return result;
};

/**
 * Pulisce tutti gli indici duplicati nel database
 * @param {string} environment - Ambiente (development, production, etc.)
 * @param {boolean} dryRun - Se true, mostra solo cosa verrebbe fatto senza eseguire
 * @returns {Promise<Object>} - Risultato della pulizia
 */
const cleanupDuplicateIndexes = async (environment = 'development', dryRun = true) => {
    const dbConfig = config[environment];
    const sequelize = new Sequelize(dbConfig);

    const result = {
        success: false,
        environment,
        dryRun,
        tablesProcessed: 0,
        totalDuplicatesFound: 0,
        totalIndexesRemoved: 0,
        errors: [],
        tableResults: []
    };

    try {
        logger.info(`🚀 Avvio pulizia indici duplicati per ambiente: ${environment}`);
        logger.info(`🔍 Modalità: ${dryRun ? 'DRY RUN (nessuna modifica)' : 'ESECUZIONE REALE'}`);

        // Verifica connessione
        await sequelize.authenticate();
        logger.info('✅ Connessione database verificata');

        // Recupera tutte le tabelle
        const tables = await sequelize.showAllTables();
        logger.info(`📋 Trovate ${tables.length} tabelle da processare`);

        // Processa ogni tabella
        for (const tableName of tables) {
            const tableResult = await cleanupTableIndexes(sequelize, tableName, dryRun);
            result.tableResults.push(tableResult);
            result.tablesProcessed++;
            result.totalDuplicatesFound += tableResult.duplicatesFound;
            result.totalIndexesRemoved += tableResult.indexesRemoved;
            result.errors.push(...tableResult.errors);
        }

        // Riepilogo finale
        logger.info('📊 Riepilogo pulizia indici:');
        logger.info(`   - Tabelle processate: ${result.tablesProcessed}`);
        logger.info(`   - Gruppi duplicati trovati: ${result.totalDuplicatesFound}`);
        logger.info(`   - Indici rimossi: ${result.totalIndexesRemoved}`);
        logger.info(`   - Errori: ${result.errors.length}`);

        if (result.errors.length === 0) {
            logger.info('✅ Pulizia completata con successo');
            result.success = true;
        } else {
            logger.warn('⚠️ Pulizia completata con alcuni errori');
            result.errors.forEach(error => logger.warn(`   - ${error}`));
        }

    } catch (error) {
        logger.error('❌ Errore durante la pulizia:', error.message);
        result.errors.push(`Errore generale: ${error.message}`);
    } finally {
        await sequelize.close();
    }

    return result;
};

/**
 * Funzione principale per l'esecuzione dello script
 */
const main = async () => {
    const environment = process.env.NODE_ENV || 'development';
    const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

    logger.info(`🚀 Avvio script pulizia indici duplicati`);
    logger.info(`   Ambiente: ${environment}`);
    logger.info(`   Modalità: ${dryRun ? 'DRY RUN' : 'ESECUZIONE REALE'}`);

    const result = await cleanupDuplicateIndexes(environment, dryRun);

    if (result.success) {
        logger.info('✅ Script completato con successo');
        process.exit(0);
    } else {
        logger.error('❌ Script completato con errori');
        process.exit(1);
    }
};

// Esegui lo script se chiamato direttamente
if (require.main === module) {
    main().catch(error => {
        logger.error('❌ Errore fatale nello script:', error);
        process.exit(1);
    });
}

module.exports = {
    cleanupDuplicateIndexes,
    cleanupTableIndexes,
    findDuplicateIndexes,
    isIndexSafeToRemove,
    removeIndex
}; 