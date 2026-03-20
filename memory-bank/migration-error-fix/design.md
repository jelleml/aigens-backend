# Design: Fix Processo Migrazione Database

## Analisi del Problema

### Causa Radice

L'errore `Duplicate key name 'inbox_user_id'` indica che:

1. La migrazione sta tentando di creare un indice che già esiste
2. Possibile esecuzione parziale di una migrazione precedente
3. Mancanza di controlli per verificare l'esistenza di indici

### Strategia di Risoluzione

## 1. Implementazione Controlli di Sicurezza

### A. Utility per Verifica Indici

```javascript
// utils/migration-helpers.js
const checkIndexExists = async (queryInterface, tableName, indexName) => {
	try {
		const indexes = await queryInterface.showIndex(tableName);
		return indexes.some((index) => index.name === indexName);
	} catch (error) {
		console.log(`Errore nel controllo indice ${indexName}:`, error.message);
		return false;
	}
};

const safeCreateIndex = async (
	queryInterface,
	tableName,
	indexName,
	fields,
	options = {}
) => {
	const exists = await checkIndexExists(queryInterface, tableName, indexName);
	if (!exists) {
		await queryInterface.addIndex(tableName, fields, {
			name: indexName,
			...options,
		});
		console.log(`Indice ${indexName} creato con successo`);
	} else {
		console.log(`Indice ${indexName} già esistente, saltato`);
	}
};
```

### B. Utility per Verifica Colonne

```javascript
const checkColumnExists = async (queryInterface, tableName, columnName) => {
	try {
		const columns = await queryInterface.describeTable(tableName);
		return columns.hasOwnProperty(columnName);
	} catch (error) {
		console.log(
			`Errore nel controllo colonna ${columnName}:`,
			error.message
		);
		return false;
	}
};

const safeAddColumn = async (
	queryInterface,
	tableName,
	columnName,
	attributes
) => {
	const exists = await checkColumnExists(
		queryInterface,
		tableName,
		columnName
	);
	if (!exists) {
		await queryInterface.addColumn(tableName, columnName, attributes);
		console.log(`Colonna ${columnName} aggiunta con successo`);
	} else {
		console.log(`Colonna ${columnName} già esistente, saltata`);
	}
};
```

## 2. Migrazione Problematica

### A. Identificazione della Migrazione

La migrazione `20250722212127-create-inbox-table` sembra essere la causa del problema.

### B. Fix della Migrazione

```javascript
// Migrazione corretta con controlli di sicurezza
"use strict";

const {
	checkIndexExists,
	safeCreateIndex,
	checkColumnExists,
	safeAddColumn,
} = require("../utils/migration-helpers");

module.exports = {
	async up(queryInterface, Sequelize) {
		const tableName = "inbox";

		// Verifica se la tabella esiste già
		const tableExists = await queryInterface
			.showAllTables()
			.then((tables) => tables.includes(tableName));

		if (!tableExists) {
			// Crea la tabella solo se non esiste
			await queryInterface.createTable(tableName, {
				id: {
					type: Sequelize.INTEGER,
					primaryKey: true,
					autoIncrement: true,
				},
				user_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: "users",
						key: "id",
					},
				},
				// ... altre colonne
			});
		}

		// Crea indici con controlli di sicurezza
		await safeCreateIndex(queryInterface, tableName, "inbox_user_id", [
			"user_id",
		]);
	},

	async down(queryInterface, Sequelize) {
		// Rollback sicuro
		await queryInterface.dropTable("inbox", { force: true });
	},
};
```

## 3. Sistema di Verifica Pre-Migrazione

### A. Script di Verifica

```javascript
// scripts/verify-migration-state.js
const { Sequelize } = require("sequelize");
const config = require("../config/database.js");

const verifyMigrationState = async () => {
	const sequelize = new Sequelize(config.development);

	try {
		// Verifica connessione
		await sequelize.authenticate();
		console.log("✅ Connessione database verificata");

		// Verifica tabelle esistenti
		const tables = await sequelize.showAllTables();
		console.log("📋 Tabelle esistenti:", tables);

		// Verifica indici problematici
		const problematicIndexes = [];
		for (const table of tables) {
			const indexes = await sequelize.showIndex(table);
			console.log(
				`📊 Indici per ${table}:`,
				indexes.map((i) => i.name)
			);
		}

		return { success: true, tables, problematicIndexes };
	} catch (error) {
		console.error("❌ Errore nella verifica:", error);
		return { success: false, error };
	} finally {
		await sequelize.close();
	}
};
```

## 4. Miglioramento Logging

### A. Logger Specializzato per Migrazioni

```javascript
// services/logging/migration-logger.js
const { createLogger } = require("../logging");

const migrationLogger = createLogger("migration", {
	level: "info",
	format: "detailed",
});

const logMigrationStep = (step, details) => {
	migrationLogger.info(`🔄 ${step}`, details);
};

const logMigrationError = (step, error) => {
	migrationLogger.error(`❌ Errore in ${step}`, {
		error: error.message,
		stack: error.stack,
	});
};

const logMigrationSuccess = (step) => {
	migrationLogger.info(`✅ ${step} completato con successo`);
};
```

## 5. Script di Pulizia e Riparazione

### A. Script per Pulizia Indici Duplicati

```javascript
// scripts/cleanup-duplicate-indexes.js
const cleanupDuplicateIndexes = async () => {
	const sequelize = new Sequelize(config.development);

	try {
		const tables = await sequelize.showAllTables();

		for (const table of tables) {
			const indexes = await sequelize.showIndex(table);
			const indexNames = indexes.map((i) => i.name);
			const duplicates = indexNames.filter(
				(name, index) => indexNames.indexOf(name) !== index
			);

			if (duplicates.length > 0) {
				console.log(
					`🔧 Pulizia indici duplicati per ${table}:`,
					duplicates
				);
				// Implementa logica di pulizia
			}
		}
	} catch (error) {
		console.error("Errore nella pulizia:", error);
	} finally {
		await sequelize.close();
	}
};
```

## 6. Processo di Implementazione

### Fasi di Implementazione:

1. **Fase 1**: Creazione utility di sicurezza
2. **Fase 2**: Fix della migrazione problematica
3. **Fase 3**: Implementazione sistema di verifica
4. **Fase 4**: Miglioramento logging
5. **Fase 5**: Test e validazione

### Test Plan:

-   Test con database pulito
-   Test con database con dati esistenti
-   Test di rollback
-   Test di performance

## 7. Documentazione e Manutenzione

### A. Documentazione per Sviluppatori

-   Guida per creare migrazioni sicure
-   Best practices per controlli di sicurezza
-   Troubleshooting guide

### B. Monitoraggio Continuo

-   Log delle migrazioni
-   Alert per errori di migrazione
-   Metriche di performance
