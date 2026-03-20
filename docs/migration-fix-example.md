# Esempio Pratico: Fix Migrazione con Errori di Indici Duplicati

## Problema Originale

L'errore `ERROR: Duplicate key name 'inbox_user_id'` si verificava durante l'esecuzione della migrazione `20250722212127-create-inbox-table.js`.

## Soluzione Implementata

### 1. Prima (Codice Problematico)

```javascript
// ❌ Migrazione originale con problemi
"use strict";

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable("inbox", {
			// ... definizione tabella
		});

		// ❌ Problema: crea indici senza controlli
		await queryInterface.addIndex("inbox", ["user_id"]);
		await queryInterface.addIndex("inbox", ["status"]);
		await queryInterface.addIndex("inbox", ["email_slug"]);
		await queryInterface.addIndex("inbox", ["created_at"]);
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable("inbox");
	},
};
```

### 2. Dopo (Codice Corretto)

```javascript
// ✅ Migrazione corretta con controlli di sicurezza
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
		const tableName = "inbox";

		try {
			logMigrationStep("Creazione tabella inbox", { tableName });

			// ✅ Crea tabella con controlli di sicurezza
			await safeCreateTable(queryInterface, tableName, {
				id: {
					type: Sequelize.UUID,
					primaryKey: true,
					allowNull: false,
				},
				user_id: {
					type: Sequelize.UUID,
					allowNull: true,
					references: {
						model: "users",
						key: "id",
					},
					onUpdate: "CASCADE",
					onDelete: "SET NULL",
				},
				// ... altre colonne
			});

			logMigrationStep("Creazione indici per tabella inbox", {
				tableName,
			});

			// ✅ Crea indici con controlli di sicurezza e nomi espliciti
			await safeCreateIndex(queryInterface, tableName, "inbox_user_id", [
				"user_id",
			]);
			await safeCreateIndex(queryInterface, tableName, "inbox_status", [
				"status",
			]);
			await safeCreateIndex(
				queryInterface,
				tableName,
				"inbox_email_slug",
				["email_slug"]
			);
			await safeCreateIndex(
				queryInterface,
				tableName,
				"inbox_created_at",
				["created_at"]
			);

			logMigrationSuccess("Migrazione tabella inbox completata");
		} catch (error) {
			logMigrationError("Creazione tabella inbox", error);
			throw error;
		}
	},

	async down(queryInterface, Sequelize) {
		const tableName = "inbox";

		try {
			logMigrationStep("Rollback tabella inbox", { tableName });
			await queryInterface.dropTable(tableName);
			logMigrationSuccess("Rollback tabella inbox completato");
		} catch (error) {
			logMigrationError("Rollback tabella inbox", error);
			throw error;
		}
	},
};
```

## Differenze Chiave

### 1. Controlli di Sicurezza

-   **Prima**: `queryInterface.addIndex()` senza controlli
-   **Dopo**: `safeCreateIndex()` con verifica esistenza

### 2. Nomi Espliciti per Indici

-   **Prima**: Nomi automatici che possono causare conflitti
-   **Dopo**: Nomi espliciti e descrittivi

### 3. Logging Dettagliato

-   **Prima**: Nessun logging
-   **Dopo**: Logging completo con emoji per facilità di lettura

### 4. Gestione Errori

-   **Prima**: Errori non gestiti
-   **Dopo**: Try-catch con logging dettagliato

## Come Applicare il Fix

### 1. Verifica Stato Database

```bash
npm run migration:verify
```

### 2. Pulizia Indici Duplicati (se necessario)

```bash
# Modalità dry-run per vedere cosa verrebbe fatto
npm run migration:cleanup:dry-run

# Esecuzione reale (solo se necessario)
npm run migration:cleanup
```

### 3. Esegui Migrazione Corretta

```bash
npm run migration:up
```

## Output di Esempio

### Log di Successo

```
] [migration] [helpers]: 🔍 Verifica indice inbox_user_id in inbox: NON ESISTE
] [migration] [helpers]: ✅ Indice inbox_user_id creato con successo in inbox
] [migration] [helpers]: 🔍 Verifica indice inbox_status in inbox: NON ESISTE
] [migration] [helpers]: ✅ Indice inbox_status creato con successo in inbox
] [migration] [helpers]: ✅ Migrazione tabella inbox completata
```

### Log di Indice Già Esistente

```
] [migration] [helpers]: 🔍 Verifica indice inbox_user_id in inbox: ESISTE
] [migration] [helpers]: ⏭️ Indice inbox_user_id già esistente in inbox, saltato
```

## Benefici Ottenuti

### 1. Zero Errori di Indici Duplicati

-   Controlli automatici prevengono errori
-   Migrazioni possono essere eseguite multiple volte senza problemi

### 2. Debugging Migliorato

-   Log dettagliati con emoji
-   Tracciabilità completa delle operazioni
-   Identificazione rapida dei problemi

### 3. Rollback Sicuro

-   Gestione errori migliorata
-   Rollback pulito in caso di problemi

### 4. Standardizzazione

-   Pattern consistenti per tutte le migrazioni
-   Template disponibili per nuove migrazioni

## Best Practices per Future Migrazioni

### 1. Sempre Utilizzare le Utility di Sicurezza

```javascript
// ✅ Corretto
await safeCreateIndex(queryInterface, "users", "idx_users_email", ["email"]);

// ❌ Evitare
await queryInterface.addIndex("users", ["email"]);
```

### 2. Utilizzare Nomi Espliciti per Indici

```javascript
// ✅ Corretto
await safeCreateIndex(queryInterface, "posts", "idx_posts_user_id", [
	"user_id",
]);

// ❌ Evitare
await safeCreateIndex(queryInterface, "posts", "user_id", ["user_id"]);
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

### 4. Testare Prima del Deploy

```bash
# Verifica stato database
npm run migration:verify

# Test migrazione
npm run migration:up
npm run migration:down
```

## Template per Nuove Migrazioni

Utilizza i template in `utils/migration-template.js`:

```javascript
const { createTableTemplate } = require("../utils/migration-template");

// Copia e modifica il template secondo le tue esigenze
```

## Comandi Utili

```bash
# Verifica stato database
npm run migration:verify

# Test utility di migrazione
npm run migration:test

# Pulizia indici duplicati (dry-run)
npm run migration:cleanup:dry-run

# Pulizia indici duplicati (esecuzione)
npm run migration:cleanup

# Migrazioni standard
npm run migration:up
npm run migration:down
```

## Conclusione

Il sistema di sicurezza per le migrazioni previene errori comuni e fornisce logging dettagliato per il debugging. Le migrazioni sono ora più robuste, sicure e tracciabili.
