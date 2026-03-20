/**
 * Utility di sicurezza per le migrazioni Sequelize
 * Fornisce controlli per evitare errori di indici e colonne duplicate
 */

const { getLogger } = require('../services/logging');

const migrationLogger = getLogger('migration', 'helpers');

/**
 * Verifica se un indice esiste nella tabella specificata
 * @param {Object} queryInterface - L'interfaccia query di Sequelize
 * @param {string} tableName - Nome della tabella
 * @param {string} indexName - Nome dell'indice da verificare
 * @returns {Promise<boolean>} - True se l'indice esiste, false altrimenti
 */
const checkIndexExists = async (queryInterface, tableName, indexName) => {
    try {
        const indexes = await queryInterface.showIndex(tableName);
        const exists = indexes.some(index => index.name === indexName);

        migrationLogger.info(`🔍 Verifica indice ${indexName} in ${tableName}: ${exists ? 'ESISTE' : 'NON ESISTE'}`);
        return exists;
    } catch (error) {
        migrationLogger.warn(`⚠️ Errore nel controllo indice ${indexName} in ${tableName}:`, error.message);
        return false;
    }
};

/**
 * Crea un indice in modo sicuro, verificando prima se esiste
 * @param {Object} queryInterface - L'interfaccia query di Sequelize
 * @param {string} tableName - Nome della tabella
 * @param {string} indexName - Nome dell'indice
 * @param {Array} fields - Campi da indicizzare
 * @param {Object} options - Opzioni aggiuntive per l'indice
 */
const safeCreateIndex = async (queryInterface, tableName, indexName, fields, options = {}) => {
    try {
        const exists = await checkIndexExists(queryInterface, tableName, indexName);

        if (!exists) {
            await queryInterface.addIndex(tableName, fields, {
                name: indexName,
                ...options
            });
            migrationLogger.info(`✅ Indice ${indexName} creato con successo in ${tableName}`);
        } else {
            migrationLogger.info(`⏭️ Indice ${indexName} già esistente in ${tableName}, saltato`);
        }
    } catch (error) {
        migrationLogger.error(`❌ Errore nella creazione indice ${indexName} in ${tableName}:`, error.message);
        throw error;
    }
};

/**
 * Verifica se una colonna esiste nella tabella specificata
 * @param {Object} queryInterface - L'interfaccia query di Sequelize
 * @param {string} tableName - Nome della tabella
 * @param {string} columnName - Nome della colonna da verificare
 * @returns {Promise<boolean>} - True se la colonna esiste, false altrimenti
 */
const checkColumnExists = async (queryInterface, tableName, columnName) => {
    try {
        const columns = await queryInterface.describeTable(tableName);
        const exists = columns.hasOwnProperty(columnName);

        migrationLogger.info(`🔍 Verifica colonna ${columnName} in ${tableName}: ${exists ? 'ESISTE' : 'NON ESISTE'}`);
        return exists;
    } catch (error) {
        migrationLogger.warn(`⚠️ Errore nel controllo colonna ${columnName} in ${tableName}:`, error.message);
        return false;
    }
};

/**
 * Aggiunge una colonna in modo sicuro, verificando prima se esiste
 * @param {Object} queryInterface - L'interfaccia query di Sequelize
 * @param {string} tableName - Nome della tabella
 * @param {string} columnName - Nome della colonna
 * @param {Object} attributes - Attributi della colonna
 */
const safeAddColumn = async (queryInterface, tableName, columnName, attributes) => {
    try {
        const exists = await checkColumnExists(queryInterface, tableName, columnName);

        if (!exists) {
            await queryInterface.addColumn(tableName, columnName, attributes);
            migrationLogger.info(`✅ Colonna ${columnName} aggiunta con successo in ${tableName}`);
        } else {
            migrationLogger.info(`⏭️ Colonna ${columnName} già esistente in ${tableName}, saltata`);
        }
    } catch (error) {
        migrationLogger.error(`❌ Errore nell'aggiunta colonna ${columnName} in ${tableName}:`, error.message);
        throw error;
    }
};

/**
 * Verifica se una tabella esiste
 * @param {Object} queryInterface - L'interfaccia query di Sequelize
 * @param {string} tableName - Nome della tabella da verificare
 * @returns {Promise<boolean>} - True se la tabella esiste, false altrimenti
 */
const checkTableExists = async (queryInterface, tableName) => {
    try {
        const tables = await queryInterface.showAllTables();
        const exists = tables.includes(tableName);

        migrationLogger.info(`🔍 Verifica tabella ${tableName}: ${exists ? 'ESISTE' : 'NON ESISTE'}`);
        return exists;
    } catch (error) {
        migrationLogger.warn(`⚠️ Errore nel controllo tabella ${tableName}:`, error.message);
        return false;
    }
};

/**
 * Crea una tabella in modo sicuro, verificando prima se esiste
 * @param {Object} queryInterface - L'interfaccia query di Sequelize
 * @param {string} tableName - Nome della tabella
 * @param {Object} attributes - Attributi della tabella
 * @param {Object} options - Opzioni aggiuntive
 */
const safeCreateTable = async (queryInterface, tableName, attributes, options = {}) => {
    try {
        const exists = await checkTableExists(queryInterface, tableName);

        if (!exists) {
            await queryInterface.createTable(tableName, attributes, options);
            migrationLogger.info(`✅ Tabella ${tableName} creata con successo`);
        } else {
            migrationLogger.info(`⏭️ Tabella ${tableName} già esistente, saltata`);
        }
    } catch (error) {
        migrationLogger.error(`❌ Errore nella creazione tabella ${tableName}:`, error.message);
        throw error;
    }
};

/**
 * Verifica se una foreign key esiste
 * @param {Object} queryInterface - L'interfaccia query di Sequelize
 * @param {string} tableName - Nome della tabella
 * @param {string} constraintName - Nome del constraint della foreign key
 * @returns {Promise<boolean>} - True se la foreign key esiste, false altrimenti
 */
const checkForeignKeyExists = async (queryInterface, tableName, constraintName) => {
    try {
        const constraints = await queryInterface.showConstraint(tableName);
        const exists = constraints.some(constraint => constraint.constraintName === constraintName);

        migrationLogger.info(`🔍 Verifica foreign key ${constraintName} in ${tableName}: ${exists ? 'ESISTE' : 'NON ESISTE'}`);
        return exists;
    } catch (error) {
        migrationLogger.warn(`⚠️ Errore nel controllo foreign key ${constraintName} in ${tableName}:`, error.message);
        return false;
    }
};

/**
 * Aggiunge una foreign key in modo sicuro
 * @param {Object} queryInterface - L'interfaccia query di Sequelize
 * @param {string} tableName - Nome della tabella
 * @param {string} constraintName - Nome del constraint
 * @param {Object} options - Opzioni della foreign key
 */
const safeAddForeignKey = async (queryInterface, tableName, constraintName, options) => {
    try {
        const exists = await checkForeignKeyExists(queryInterface, tableName, constraintName);

        if (!exists) {
            await queryInterface.addConstraint(tableName, {
                name: constraintName,
                ...options
            });
            migrationLogger.info(`✅ Foreign key ${constraintName} aggiunta con successo in ${tableName}`);
        } else {
            migrationLogger.info(`⏭️ Foreign key ${constraintName} già esistente in ${tableName}, saltata`);
        }
    } catch (error) {
        migrationLogger.error(`❌ Errore nell'aggiunta foreign key ${constraintName} in ${tableName}:`, error.message);
        throw error;
    }
};

/**
 * Utility per logging dettagliato delle migrazioni
 * @param {string} step - Nome dello step di migrazione
 * @param {Object} details - Dettagli aggiuntivi
 */
const logMigrationStep = (step, details = {}) => {
    migrationLogger.info(`🔄 ${step}`, details);
};

/**
 * Utility per logging degli errori di migrazione
 * @param {string} step - Nome dello step di migrazione
 * @param {Error} error - Errore occorso
 */
const logMigrationError = (step, error) => {
    migrationLogger.error(`❌ Errore in ${step}`, {
        error: error.message,
        stack: error.stack
    });
};

/**
 * Utility per logging del successo di migrazione
 * @param {string} step - Nome dello step di migrazione
 */
const logMigrationSuccess = (step) => {
    migrationLogger.info(`✅ ${step} completato con successo`);
};

module.exports = {
    checkIndexExists,
    safeCreateIndex,
    checkColumnExists,
    safeAddColumn,
    checkTableExists,
    safeCreateTable,
    checkForeignKeyExists,
    safeAddForeignKey,
    logMigrationStep,
    logMigrationError,
    logMigrationSuccess
}; 