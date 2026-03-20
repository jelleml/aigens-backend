# Guida alla Sicurezza delle Migrazioni

## Panoramica

Questa guida descrive come utilizzare le utility di sicurezza per evitare errori comuni durante le migrazioni del database, come indici duplicati e colonne già esistenti.

## Problemi Comuni

### 1. Errori di Indici Duplicati

```
ERROR: Duplicate key name 'inbox_user_id'
```

Questo errore si verifica quando si tenta di creare un indice che già esiste nel database.

### 2. Errori di Colonne Duplicate

```
ERROR: Duplicate column name 'status'
```

Questo errore si verifica quando si tenta di aggiungere una colonna che già esiste.

### 3. Errori di Tabelle Duplicate

```
ERROR: Table 'inbox' already exists
```

Questo errore si verifica quando si tenta di creare una tabella che già esiste.

## Utility di Sicurezza

### Importazione delle Utility

```javascript
const {
	safeCreateTable,
	safeCreateIndex,
	safeAddColumn,
	safeAddForeignKey,
	logMigrationStep,
	logMigrationError,
	logMigrationSuccess,
} = require("../utils/migration-helpers");
```

### 1. Creazione Sicura di Tabelle

```javascript
// ❌ Modo non sicuro
await queryInterface.createTable("users", {
	id: { type: Sequelize.INTEGER, primaryKey: true },
	email: { type: Sequelize.STRING },
});

// ✅ Modo sicuro
await safeCreateTable(queryInterface, "users", {
	id: { type: Sequelize.INTEGER, primaryKey: true },
	email: { type: Sequelize.STRING },
});
```

### 2. Creazione Sicura di Indici

```javascript
// ❌ Modo non sicuro
await queryInterface.addIndex("users", ["email"]);

// ✅ Modo sicuro
await safeCreateIndex(queryInterface, "users", "idx_users_email", ["email"]);
```

### 3. Aggiunta Sicura di Colonne

```javascript
// ❌ Modo non sicuro
await queryInterface.addColumn("users", "status", {
	type: Sequelize.STRING,
	allowNull: false,
});

// ✅ Modo sicuro
await safeAddColumn(queryInterface, "users", "status", {
	type: Sequelize.STRING,
	allowNull: false,
});
```

### 4. Aggiunta Sicura di Foreign Keys

```javascript
// ❌ Modo non sicuro
await queryInterface.addConstraint("posts", {
	fields: ["user_id"],
	type: "foreign key",
	references: { table: "users", field: "id" },
});

// ✅ Modo sicuro
await safeAddForeignKey(queryInterface, "posts", "fk_posts_users", {
	type: "foreign key",
	fields: ["user_id"],
	references: { table: "users", field: "id" },
});
```

## Logging Migliorato

### Funzioni di Logging

```javascript
// Log di inizio step
logMigrationStep("Creazione tabella users", { tableName: "users" });

// Log di errore
logMigrationError("Creazione tabella users", error);

// Log di successo
logMigrationSuccess("Creazione tabella users completata");
```

### Esempio Completo di Migrazione Sicura

```javascript
"use strict";

const {
	safeCreateTable,
	safeCreateIndex,
	logMigrationStep,
	logMigrationError,
	logMigrationSuccess,
} = require("../utils/migration-helpers");

module.exports = {
	async up(queryInterface, Sequelize) {
		const tableName = "users";

		try {
			logMigrationStep("Creazione tabella users", { tableName });

			// Crea tabella con controlli di sicurezza
			await safeCreateTable(queryInterface, tableName, {
				id: {
					type: Sequelize.INTEGER,
					primaryKey: true,
					autoIncrement: true,
				},
				email: {
					type: Sequelize.STRING,
					allowNull: false,
					unique: true,
				},
				name: {
					type: Sequelize.STRING,
					allowNull: false,
				},
				created_at: {
					type: Sequelize.DATE,
					allowNull: false,
					defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
				},
				updated_at: {
					type: Sequelize.DATE,
					allowNull: false,
					defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
				},
			});

			logMigrationStep("Creazione indici per tabella users", {
				tableName,
			});

			// Crea indici con controlli di sicurezza
			await safeCreateIndex(
				queryInterface,
				tableName,
				"idx_users_email",
				["email"]
			);
			await safeCreateIndex(queryInterface, tableName, "idx_users_name", [
				"name",
			]);

			logMigrationSuccess("Migrazione tabella users completata");
		} catch (error) {
			logMigrationError("Creazione tabella users", error);
			throw error;
		}
	},

	async down(queryInterface, Sequelize) {
		const tableName = "users";

		try {
			logMigrationStep("Rollback tabella users", { tableName });
			await queryInterface.dropTable(tableName);
			logMigrationSuccess("Rollback tabella users completato");
		} catch (error) {
			logMigrationError("Rollback tabella users", error);
			throw error;
		}
	},
};
```

## Script di Verifica e Pulizia

### 1. Verifica Stato Database

Prima di eseguire le migrazioni, verifica lo stato del database:

```bash
npm run migration:verify
```

Questo script:

-   Verifica la connessione al database
-   Controlla le tabelle esistenti
-   Identifica indici problematici
-   Fornisce un report dettagliato

### 2. Pulizia Indici Duplicati

Se vengono identificati indici duplicati, puoi pulirli:

```bash
# Modalità dry-run (solo visualizzazione)
npm run migration:cleanup:dry-run

# Esecuzione reale
npm run migration:cleanup
```

## Best Practices

### 1. Sempre Utilizzare le Utility di Sicurezza

```javascript
// ✅ Corretto
await safeCreateIndex(queryInterface, "users", "idx_users_email", ["email"]);

// ❌ Evitare
await queryInterface.addIndex("users", ["email"]);
```

### 2. Utilizzare Nomi Espliciti per gli Indici

```javascript
// ✅ Corretto
await safeCreateIndex(queryInterface, "users", "idx_users_email", ["email"]);

// ❌ Evitare
await safeCreateIndex(queryInterface, "users", "email", ["email"]);
```

### 3. Implementare Logging Dettagliato

```javascript
try {
	logMigrationStep("Operazione", { details: "info" });
	// ... operazione
	logMigrationSuccess("Operazione completata");
} catch (error) {
	logMigrationError("Operazione", error);
	throw error;
}
```

### 4. Testare le Migrazioni

```bash
# Test con database di sviluppo
npm run migration:verify
npm run migration:up
npm run migration:down
```

### 5. Backup Prima delle Migrazioni

```bash
# Backup del database prima delle migrazioni
mysqldump -u username -p database_name > backup_$(date +%Y%m%d_%H%M%S).sql
```

## Troubleshooting

### Errore: "Cannot find module '../utils/migration-helpers'"

Assicurati che il percorso sia corretto. Se la migrazione è in `migrations/`, il percorso dovrebbe essere:

```javascript
const helpers = require("../utils/migration-helpers");
```

### Errore: "Table already exists"

Utilizza `safeCreateTable` invece di `createTable`:

```javascript
// ✅ Corretto
await safeCreateTable(queryInterface, "users", attributes);

// ❌ Evitare
await queryInterface.createTable("users", attributes);
```

### Errore: "Duplicate key name"

Utilizza `safeCreateIndex` invece di `addIndex`:

```javascript
// ✅ Corretto
await safeCreateIndex(queryInterface, "users", "idx_users_email", ["email"]);

// ❌ Evitare
await queryInterface.addIndex("users", ["email"]);
```

## Template Disponibili

Utilizza i template in `utils/migration-template.js` per creare migrazioni sicure:

```javascript
const { createTableTemplate } = require("../utils/migration-template");

// Copia e modifica il template secondo le tue esigenze
```

## Comandi Utili

```bash
# Verifica stato database
npm run migration:verify

# Esegui migrazioni
npm run migration:up

# Rollback migrazione
npm run migration:down

# Pulizia indici duplicati (dry-run)
npm run migration:cleanup:dry-run

# Pulizia indici duplicati (esecuzione)
npm run migration:cleanup
```

## Monitoraggio

Le utility di sicurezza forniscono logging dettagliato che può essere monitorato per:

-   Identificare problemi durante le migrazioni
-   Tracciare le operazioni eseguite
-   Debuggare errori
-   Monitorare le performance

I log includono emoji per facilitare la lettura:

-   🔍 Verifica
-   ✅ Successo
-   ❌ Errore
-   ⚠️ Avviso
-   🔧 Operazione
-   📊 Statistiche
