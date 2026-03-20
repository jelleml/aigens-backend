/**
 * Template per migrazioni sicure
 * Utilizza le utility di sicurezza per evitare errori di indici e colonne duplicate
 */

const {
    safeCreateTable,
    safeCreateIndex,
    safeAddColumn,
    safeAddForeignKey,
    logMigrationStep,
    logMigrationError,
    logMigrationSuccess
} = require('./migration-helpers');

/**
 * Template per migrazione di creazione tabella
 */
const createTableTemplate = {
    async up(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';

        try {
            logMigrationStep('Creazione tabella', { tableName });

            // Crea la tabella con controlli di sicurezza
            await safeCreateTable(queryInterface, tableName, {
                id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                // Aggiungi altre colonne qui
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });

            logMigrationStep('Creazione indici per tabella', { tableName });

            // Crea indici con controlli di sicurezza
            await safeCreateIndex(queryInterface, tableName, 'idx_nome_tabella_colonna', ['colonna']);

            logMigrationSuccess('Migrazione tabella completata');

        } catch (error) {
            logMigrationError('Creazione tabella', error);
            throw error;
        }
    },

    async down(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';

        try {
            logMigrationStep('Rollback tabella', { tableName });
            await queryInterface.dropTable(tableName);
            logMigrationSuccess('Rollback tabella completato');
        } catch (error) {
            logMigrationError('Rollback tabella', error);
            throw error;
        }
    }
};

/**
 * Template per migrazione di aggiunta colonna
 */
const addColumnTemplate = {
    async up(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';
        const columnName = 'nome_colonna';

        try {
            logMigrationStep('Aggiunta colonna', { tableName, columnName });

            // Aggiungi colonna con controlli di sicurezza
            await safeAddColumn(queryInterface, tableName, columnName, {
                type: Sequelize.STRING,
                allowNull: true
            });

            logMigrationSuccess('Colonna aggiunta con successo');

        } catch (error) {
            logMigrationError('Aggiunta colonna', error);
            throw error;
        }
    },

    async down(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';
        const columnName = 'nome_colonna';

        try {
            logMigrationStep('Rimozione colonna', { tableName, columnName });
            await queryInterface.removeColumn(tableName, columnName);
            logMigrationSuccess('Colonna rimossa con successo');
        } catch (error) {
            logMigrationError('Rimozione colonna', error);
            throw error;
        }
    }
};

/**
 * Template per migrazione di aggiunta indice
 */
const addIndexTemplate = {
    async up(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';
        const indexName = 'idx_nome_tabella_colonna';
        const columns = ['colonna'];

        try {
            logMigrationStep('Aggiunta indice', { tableName, indexName, columns });

            // Aggiungi indice con controlli di sicurezza
            await safeCreateIndex(queryInterface, tableName, indexName, columns);

            logMigrationSuccess('Indice aggiunto con successo');

        } catch (error) {
            logMigrationError('Aggiunta indice', error);
            throw error;
        }
    },

    async down(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';
        const indexName = 'idx_nome_tabella_colonna';

        try {
            logMigrationStep('Rimozione indice', { tableName, indexName });
            await queryInterface.removeIndex(tableName, indexName);
            logMigrationSuccess('Indice rimosso con successo');
        } catch (error) {
            logMigrationError('Rimozione indice', error);
            throw error;
        }
    }
};

/**
 * Template per migrazione di aggiunta foreign key
 */
const addForeignKeyTemplate = {
    async up(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';
        const constraintName = 'fk_nome_tabella_referenced_table';

        try {
            logMigrationStep('Aggiunta foreign key', { tableName, constraintName });

            // Aggiungi foreign key con controlli di sicurezza
            await safeAddForeignKey(queryInterface, tableName, constraintName, {
                type: 'foreign key',
                fields: ['foreign_key_column'],
                references: {
                    table: 'referenced_table',
                    field: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            });

            logMigrationSuccess('Foreign key aggiunta con successo');

        } catch (error) {
            logMigrationError('Aggiunta foreign key', error);
            throw error;
        }
    },

    async down(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';
        const constraintName = 'fk_nome_tabella_referenced_table';

        try {
            logMigrationStep('Rimozione foreign key', { tableName, constraintName });
            await queryInterface.removeConstraint(tableName, constraintName);
            logMigrationSuccess('Foreign key rimossa con successo');
        } catch (error) {
            logMigrationError('Rimozione foreign key', error);
            throw error;
        }
    }
};

/**
 * Template per migrazione complessa con multiple operazioni
 */
const complexMigrationTemplate = {
    async up(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';

        try {
            logMigrationStep('Inizio migrazione complessa', { tableName });

            // 1. Crea tabella
            await safeCreateTable(queryInterface, tableName, {
                id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                // ... altre colonne
            });

            // 2. Aggiungi colonne
            await safeAddColumn(queryInterface, tableName, 'colonna1', {
                type: Sequelize.STRING,
                allowNull: true
            });

            await safeAddColumn(queryInterface, tableName, 'colonna2', {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            });

            // 3. Aggiungi indici
            await safeCreateIndex(queryInterface, tableName, 'idx_colonna1', ['colonna1']);
            await safeCreateIndex(queryInterface, tableName, 'idx_colonna2', ['colonna2']);

            // 4. Aggiungi foreign key
            await safeAddForeignKey(queryInterface, tableName, 'fk_referenced', {
                type: 'foreign key',
                fields: ['foreign_key_column'],
                references: {
                    table: 'referenced_table',
                    field: 'id'
                }
            });

            logMigrationSuccess('Migrazione complessa completata');

        } catch (error) {
            logMigrationError('Migrazione complessa', error);
            throw error;
        }
    },

    async down(queryInterface, Sequelize) {
        const tableName = 'nome_tabella';

        try {
            logMigrationStep('Rollback migrazione complessa', { tableName });

            // Rimuovi in ordine inverso
            await queryInterface.removeConstraint(tableName, 'fk_referenced');
            await queryInterface.removeIndex(tableName, 'idx_colonna2');
            await queryInterface.removeIndex(tableName, 'idx_colonna1');
            await queryInterface.removeColumn(tableName, 'colonna2');
            await queryInterface.removeColumn(tableName, 'colonna1');
            await queryInterface.dropTable(tableName);

            logMigrationSuccess('Rollback migrazione complessa completato');
        } catch (error) {
            logMigrationError('Rollback migrazione complessa', error);
            throw error;
        }
    }
};

module.exports = {
    createTableTemplate,
    addColumnTemplate,
    addIndexTemplate,
    addForeignKeyTemplate,
    complexMigrationTemplate
}; 