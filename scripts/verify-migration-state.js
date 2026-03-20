/**
 * Script per verificare lo stato del database prima delle migrazioni
 * Identifica potenziali problemi che potrebbero causare errori durante le migrazioni
 */

const { Sequelize } = require('sequelize');
const config = require('../config/database.js');
const { getLogger } = require('../services/logging');

const logger = getLogger('migration', 'verifier');

/**
 * Verifica la connessione al database
 * @param {Sequelize} sequelize - Istanza Sequelize
 * @returns {Promise<boolean>} - True se la connessione è riuscita
 */
const verifyConnection = async (sequelize) => {
    try {
        await sequelize.authenticate();
        logger.info('✅ Connessione database verificata con successo');
        return true;
    } catch (error) {
        logger.error('❌ Errore nella connessione database:', error.message);
        return false;
    }
};

/**
 * Verifica le tabelle esistenti nel database
 * @param {Sequelize} sequelize - Istanza Sequelize
 * @returns {Promise<Array>} - Lista delle tabelle esistenti
 */
const verifyTables = async (sequelize) => {
    try {
        const tables = await sequelize.showAllTables();
        logger.info(`📋 Tabelle esistenti (${tables.length}):`, tables);
        return tables;
    } catch (error) {
        logger.error('❌ Errore nel recupero tabelle:', error.message);
        return [];
    }
};

/**
 * Verifica gli indici di una tabella specifica
 * @param {Sequelize} sequelize - Istanza Sequelize
 * @param {string} tableName - Nome della tabella
 * @returns {Promise<Array>} - Lista degli indici della tabella
 */
const verifyTableIndexes = async (sequelize, tableName) => {
    try {
        const indexes = await sequelize.showIndex(tableName);
        logger.info(`📊 Indici per ${tableName} (${indexes.length}):`,
            indexes.map(i => ({ name: i.name, fields: i.fields.map(f => f.attribute) })));
        return indexes;
    } catch (error) {
        logger.warn(`⚠️ Errore nel recupero indici per ${tableName}:`, error.message);
        return [];
    }
};

/**
 * Verifica le colonne di una tabella specifica
 * @param {Sequelize} sequelize - Istanza Sequelize
 * @param {string} tableName - Nome della tabella
 * @returns {Promise<Object>} - Struttura delle colonne della tabella
 */
const verifyTableColumns = async (sequelize, tableName) => {
    try {
        const columns = await sequelize.describeTable(tableName);
        logger.info(`📋 Colonne per ${tableName} (${Object.keys(columns).length}):`,
            Object.keys(columns));
        return columns;
    } catch (error) {
        logger.warn(`⚠️ Errore nel recupero colonne per ${tableName}:`, error.message);
        return {};
    }
};

/**
 * Identifica indici duplicati o problematici
 * @param {Array} indexes - Lista degli indici
 * @returns {Array} - Indici problematici
 */
const identifyProblematicIndexes = (indexes) => {
    const indexNames = indexes.map(i => i.name);
    const duplicates = indexNames.filter((name, index) => indexNames.indexOf(name) !== index);

    if (duplicates.length > 0) {
        logger.warn(`⚠️ Indici duplicati trovati:`, duplicates);
    }

    return duplicates;
};

/**
 * Verifica le foreign keys di una tabella
 * @param {Sequelize} sequelize - Istanza Sequelize
 * @param {string} tableName - Nome della tabella
 * @returns {Promise<Array>} - Lista delle foreign keys
 */
const verifyForeignKeys = async (sequelize, tableName) => {
    try {
        const constraints = await sequelize.showConstraint(tableName);
        const foreignKeys = constraints.filter(c => c.constraintType === 'FOREIGN KEY');

        if (foreignKeys.length > 0) {
            logger.info(`🔗 Foreign keys per ${tableName} (${foreignKeys.length}):`,
                foreignKeys.map(fk => fk.constraintName));
        }

        return foreignKeys;
    } catch (error) {
        logger.warn(`⚠️ Errore nel recupero foreign keys per ${tableName}:`, error.message);
        return [];
    }
};

/**
 * Verifica lo stato generale del database
 * @param {string} environment - Ambiente (development, production, etc.)
 * @returns {Promise<Object>} - Risultato della verifica
 */
const verifyMigrationState = async (environment = 'development') => {
    const dbConfig = config[environment];

    // Verifica che la configurazione sia completa
    if (!dbConfig || !dbConfig.host || !dbConfig.database) {
        logger.error('❌ Configurazione database incompleta per ambiente:', environment);
        logger.error('   Configurazione trovata:', JSON.stringify(dbConfig, null, 2));
        return {
            success: false,
            connection: false,
            tables: [],
            problematicIndexes: [],
            summary: {
                totalTables: 0,
                totalIndexes: 0,
                totalForeignKeys: 0,
                issues: ['Configurazione database incompleta']
            }
        };
    }

    const sequelize = new Sequelize(dbConfig);

    const result = {
        success: false,
        connection: false,
        tables: [],
        problematicIndexes: [],
        summary: {
            totalTables: 0,
            totalIndexes: 0,
            totalForeignKeys: 0,
            issues: []
        }
    };

    try {
        logger.info(`🔍 Inizio verifica stato database per ambiente: ${environment}`);
        logger.info(`   Host: ${dbConfig.host}:${dbConfig.port || 3306}`);
        logger.info(`   Database: ${dbConfig.database}`);
        logger.info(`   Username: ${dbConfig.username}`);

        // Verifica connessione
        result.connection = await verifyConnection(sequelize);
        if (!result.connection) {
            result.summary.issues.push('Connessione database fallita');
            return result;
        }

        // Verifica tabelle
        result.tables = await verifyTables(sequelize);
        result.summary.totalTables = result.tables.length;

        // Verifica dettagliata per ogni tabella
        for (const tableName of result.tables) {
            logger.info(`🔍 Analisi dettagliata tabella: ${tableName}`);

            // Verifica indici
            const indexes = await verifyTableIndexes(sequelize, tableName);
            result.summary.totalIndexes += indexes.length;

            // Identifica indici problematici
            const problematicIndexes = identifyProblematicIndexes(indexes);
            if (problematicIndexes.length > 0) {
                result.problematicIndexes.push({
                    table: tableName,
                    indexes: problematicIndexes
                });
                result.summary.issues.push(`Indici duplicati in ${tableName}: ${problematicIndexes.join(', ')}`);
            }

            // Verifica colonne
            await verifyTableColumns(sequelize, tableName);

            // Verifica foreign keys
            const foreignKeys = await verifyForeignKeys(sequelize, tableName);
            result.summary.totalForeignKeys += foreignKeys.length;
        }

        // Riepilogo finale
        logger.info('📊 Riepilogo verifica:');
        logger.info(`   - Tabelle: ${result.summary.totalTables}`);
        logger.info(`   - Indici totali: ${result.summary.totalIndexes}`);
        logger.info(`   - Foreign keys: ${result.summary.totalForeignKeys}`);
        logger.info(`   - Problemi identificati: ${result.summary.issues.length}`);

        if (result.summary.issues.length === 0) {
            logger.info('✅ Nessun problema identificato - database pronto per migrazioni');
            result.success = true;
        } else {
            logger.warn('⚠️ Problemi identificati che potrebbero causare errori nelle migrazioni:');
            result.summary.issues.forEach(issue => logger.warn(`   - ${issue}`));
        }

    } catch (error) {
        logger.error('❌ Errore durante la verifica:', error.message);
        result.summary.issues.push(`Errore generale: ${error.message}`);
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

    logger.info(`🚀 Avvio verifica stato database per ambiente: ${environment}`);

    const result = await verifyMigrationState(environment);

    if (result.success) {
        logger.info('✅ Verifica completata con successo - database pronto per migrazioni');
        process.exit(0);
    } else {
        logger.error('❌ Verifica fallita - problemi identificati nel database');
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
    verifyMigrationState,
    verifyConnection,
    verifyTables,
    verifyTableIndexes,
    verifyTableColumns,
    verifyForeignKeys,
    identifyProblematicIndexes
}; 