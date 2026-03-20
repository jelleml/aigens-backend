# Database and Model Management Scripts

This document describes the scripts available for database management, model initialization, and model statistics updates.

## Model Setup and Statistics

### 1. Model Setup

For detailed instructions on setting up models, please refer to [README-models-setup.md](./README-models-setup.md).

### 2. Model Statistics Update

The `update-model-stats-aa-and-relations.js` script automates the process of updating model statistics after model setup:

```bash
node scripts/update-model-stats-aa-and-relations.js
```

This script performs the following operations:
- Refreshes model statistics in the `models_stats_aa` table
- Refreshes model relationships in the `models_models_stats_aa` table
- Updates price scores from the artificial analysis data

Each operation includes verification steps and appropriate delays to ensure the database is updated correctly.

**Features:**
- Automatic retry logic for failed operations
- Comprehensive error handling and logging
- Verification of each operation's success
- Configurable delays between operations

You can also run this script using the npm command:

```bash
npm run update-model-stats-aa-and-relations
```

**When to use:**
- After running the model setup scripts
- When you need to refresh model statistics and relationships
- When you need to update price scores based on artificial analysis data

# Database Management Scripts

## 🚨 Deprecation Notice

**All scripts that previously managed table creation or schema sync using `sync()` or direct SQL are now deprecated.**

-   Table creation, schema changes, and index management must be done via Sequelize migrations and the centralized `DatabaseManager` (`database/index.js`).
-   The following scripts are deprecated for schema management:
    -   `scripts/ensure-all-tables-and-models.js`
    -   `scripts/create-new-models.js`
    -   `scripts/fix-migration-issues.js`
-   These scripts now only provide reporting or data population (if needed) and will not create or alter tables.
-   **Use the migration workflow and the scripts below for all schema and data management.**

## Centralized Database Management

All database operations are now managed through a centralized `DatabaseManager` class in `database/index.js`. This ensures safe, consistent, and maintainable handling of models, migrations, and schema changes.

## Migration and Seeding

Use the `scripts/db-manager.js` utility to run migrations, create new migrations, seed the database, and check database health.

### Usage

**Run all migrations:**

```
node -e "require('./scripts/db-manager').runMigration()"
```

**Undo last migration:**

```
node -e "require('./scripts/db-manager').undoLastMigration()"
```

**Create a new migration:**

```
node -e "require('./scripts/db-manager').createMigration('migration-name')"
```

**Seed the database:**

```
node -e "require('./scripts/db-manager').seedDatabase()"
```

**Check database health:**

```
node -e "require('./scripts/db-manager').checkDatabaseHealth()"
```

## Duplicate Index Cleanup

Use the `scripts/cleanup.js` utility to remove duplicate indexes from all tables:

```
node -e "require('./scripts/cleanup').removeDuplicateIndexes()"
```

## Best Practices

-   **Do not use `sync({ force: true })` in production.**
-   Use migrations for all schema changes.
-   Use the centralized `DatabaseManager` for all model and schema operations.
-   Run health checks and cleanup scripts regularly in development and staging environments.
-   For data population (e.g., initial AI models), use dedicated scripts that do not alter schema.

## Deprecated Scripts and Their Purpose

| Script                          | Status     | Purpose (now)               | Replacement/Alternative                |
| ------------------------------- | ---------- | --------------------------- | -------------------------------------- |
| ensure-all-tables-and-models.js | Deprecated | Only populates models table | Use migrations + model population only |
| create-new-models.js            | Deprecated | Only reports model files    | Use migrations                         |
| fix-migration-issues.js         | Deprecated | Only fixes data/FK issues   | Use migrations                         |

---

For more details, see the code in `database/index.js`, `scripts/db-manager.js`, and `scripts/cleanup.js`. If you have legacy scripts, check their headers for deprecation and usage notes.
