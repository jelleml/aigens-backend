# Memory Bank - Aigens Backend

This memory bank serves as a central repository for Aigens Backend project documentation and knowledge.

## Structure

-   `context/`: Contains project context information, business requirements and objectives
-   `decisions/`: Documents important decisions made during development
-   `architecture/`: Contains system architectural documentation
-   `api/`: Detailed API documentation

## Database Sync & Migration Management (Canonical Knowledge)

This document is the canonical internal guide for all database sync and migration management for the Aigens Backend. It is maintained under `memory-bank/architecture/database/` for internal reference by all team members.

**As of 2024, all database schema management, table creation, and index management must be performed via Sequelize migrations and the centralized `DatabaseManager` (`database/index.js`).**

-   All previous scripts that used `sync()` or direct SQL for schema changes are deprecated.
-   The canonical workflow for DB management is:
    1. Use migrations for all schema changes (creation, alteration, indexes, etc.).
    2. Use the `DatabaseManager` for all model loading and DB access in the codebase.
    3. Use the scripts in the `scripts/` folder for migrations, seeding, health checks, and duplicate index cleanup.
-   See the main `scripts/README.md` for full, up-to-date instructions and best practices.
-   Deprecated scripts (e.g., `ensure-all-tables-and-models.js`, `create-new-models.js`, `fix-migration-issues.js`) now only provide reporting or data population and will not create or alter tables.

**This is the canonical internal knowledge for DB management. All team members must follow this process.**

For details, see:

-   `scripts/README.md` (full migration and DB management guide)
-   `database/index.js` (DatabaseManager implementation)
-   `scripts/db-manager.js`, `scripts/cleanup.js` (migration and maintenance utilities)
