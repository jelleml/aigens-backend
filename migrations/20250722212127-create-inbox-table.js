'use strict';

const {
  safeCreateTable,
  safeCreateIndex,
  logMigrationStep,
  logMigrationError,
  logMigrationSuccess
} = require('../utils/migration-helpers');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableName = 'inbox';

    try {
      logMigrationStep('Creazione tabella inbox', { tableName });

      // Crea la tabella con controlli di sicurezza
      await safeCreateTable(queryInterface, tableName, {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        recipient: {
          type: Sequelize.STRING,
          allowNull: false
        },
        email_slug: {
          type: Sequelize.STRING,
          allowNull: false
        },
        subject: {
          type: Sequelize.STRING,
          allowNull: false
        },
        content: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        replacements: {
          type: Sequelize.JSON,
          allowNull: true
        },
        status: {
          type: Sequelize.ENUM('pending', 'sent', 'error'),
          defaultValue: 'pending'
        },
        retry_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        sent_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        error_message: {
          type: Sequelize.TEXT,
          allowNull: true
        },
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

      logMigrationStep('Creazione indici per tabella inbox', { tableName });

      // Crea indici con controlli di sicurezza
      await safeCreateIndex(queryInterface, tableName, 'inbox_user_id', ['user_id']);
      await safeCreateIndex(queryInterface, tableName, 'inbox_status', ['status']);
      await safeCreateIndex(queryInterface, tableName, 'inbox_email_slug', ['email_slug']);
      await safeCreateIndex(queryInterface, tableName, 'inbox_created_at', ['created_at']);

      logMigrationSuccess('Migrazione tabella inbox completata');

    } catch (error) {
      logMigrationError('Creazione tabella inbox', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const tableName = 'inbox';

    try {
      logMigrationStep('Rollback tabella inbox', { tableName });
      await queryInterface.dropTable(tableName);
      logMigrationSuccess('Rollback tabella inbox completato');
    } catch (error) {
      logMigrationError('Rollback tabella inbox', error);
      throw error;
    }
  }
};
