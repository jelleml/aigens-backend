# Migration Guide: Fixing Foreign Key Constraint Issues

This guide provides solutions for resolving the foreign key constraint errors encountered when migrating the users table from using integer IDs to UUIDs.

## The Problem

During the migration process, you might encounter an error when attempting to drop the users table due to foreign key constraints from other tables referring to it.

The error typically looks like this:

```
Error: ER_ROW_IS_REFERENCED_2: Cannot delete or update a parent row: a foreign key constraint fails
```

## Solution 1: Run Migrations in the Correct Order

The recommended approach is to run the migrations in the following order:

1. `20250320000002-update-users-table.js` - Creates the new users table structure with UUIDs
2. `20250320000003-update-foreign-keys.js` - Updates all foreign key references in related tables

This approach has been fixed in the migration files to properly handle the foreign key constraints by:

-   First creating a new users table with UUID keys instead of replacing the existing one
-   Creating a mapping between old IDs and new UUIDs
-   Updating all references in foreign tables to use the new UUIDs
-   Only dropping the old users table after all references have been updated

Run migrations with:

```bash
npx sequelize-cli db:migrate
```

## Solution 2: Fix Migration Issues with a Script

If you've already attempted the migration and encountered issues, you can use the provided fix script to resolve them:

```bash
node scripts/fix-migration-issues.js
```

This script will:

1. Check for inconsistencies in the database structure
2. Fix foreign key constraints pointing to the old users table
3. Update table columns to use UUID format
4. Complete the migration by dropping/renaming tables as needed
5. Clean up any temporary tables created during migration

## Solution 3: Manual Database Fixes

If the automated solutions don't work, you can manually fix the database:

### For MySQL:

```sql
-- 1. Identify tables with foreign keys to users
SELECT TABLE_NAME, CONSTRAINT_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'users';

-- 2. Drop each foreign key constraint
ALTER TABLE table_name DROP FOREIGN KEY constraint_name;

-- 3. Drop the users table
DROP TABLE users;

-- 4. Rename users_new to users
RENAME TABLE users_new TO users;

-- 5. Add back foreign key constraints
ALTER TABLE table_name
ADD CONSTRAINT table_name_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id)
ON DELETE CASCADE ON UPDATE CASCADE;
```

### For PostgreSQL:

```sql
-- 1. Identify tables with foreign keys to users
SELECT
    tc.table_name, tc.constraint_name
FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
WHERE constraint_type = 'FOREIGN KEY' AND kcu.referenced_table_name='users';

-- 2. Drop each foreign key constraint
ALTER TABLE table_name DROP CONSTRAINT constraint_name;

-- 3. Drop the users table
DROP TABLE users;

-- 4. Rename users_new to users
ALTER TABLE users_new RENAME TO users;

-- 5. Add back foreign key constraints
ALTER TABLE table_name
ADD CONSTRAINT table_name_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id)
ON DELETE CASCADE ON UPDATE CASCADE;
```

## Prevention of Future Issues

For future migrations that involve changing primary keys or table structures with foreign key relationships:

1. Always create a backup table before making changes
2. Use a multi-step migration approach:
    - Create new tables with the desired structure
    - Update all references in other tables
    - Only then drop or rename the original tables
3. Include proper error handling in your migration scripts
4. Test migrations on a development database before running in production
