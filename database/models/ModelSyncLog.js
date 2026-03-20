/**
 * ModelSyncLog Model
 * 
 * Tracks all model synchronization operations across providers,
 * providing audit trail and monitoring capabilities.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModelSyncLog = sequelize.define('ModelSyncLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    execution_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Unique identifier for the sync execution batch'
    },
    id_provider: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Provider ID (null for system-wide operations)'
    },
    sync_type: {
      type: DataTypes.ENUM('init', 'update', 'sync', 'health_check'),
      allowNull: false,
      comment: 'Type of synchronization operation'
    },
    sync_mode: {
      type: DataTypes.ENUM('manual', 'scheduled', 'api', 'system'),
      allowNull: false,
      defaultValue: 'manual',
      comment: 'How the sync was triggered'
    },
    status: {
      type: DataTypes.ENUM('started', 'running', 'completed', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'started',
      comment: 'Current status of the sync operation'
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When the sync operation started'
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the sync operation completed (success or failure)'
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Duration of the operation in milliseconds'
    },
    models_processed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of models processed in this operation'
    },
    models_created: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of new models created'
    },
    models_updated: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of existing models updated'
    },
    models_removed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of models removed (sync mode only)'
    },
    relationships_created: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of aggregated model relationships created'
    },
    errors_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of errors encountered during sync'
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Primary error message if sync failed'
    },
    error_details: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Detailed error information and stack traces'
    },
    configuration: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Sync configuration parameters used'
    },
    statistics: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Detailed processing statistics and metrics'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata about the sync operation'
    },
    triggered_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'User or system that triggered the sync'
    },
    dry_run: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether this was a dry-run execution'
    }
  }, {
    tableName: 'model_sync_logs',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['execution_id']
      },
      {
        fields: ['id_provider']
      },
      {
        fields: ['sync_type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['started_at']
      },
      {
        fields: ['sync_type', 'status']
      },
      {
        fields: ['id_provider', 'started_at']
      }
    ]
  });

  ModelSyncLog.associate = (models) => {
    // Association with Provider
    ModelSyncLog.belongsTo(models.Provider, {
      foreignKey: 'id_provider',
      as: 'provider'
    });
  };

  // Instance methods
  ModelSyncLog.prototype.markCompleted = function(stats = {}) {
    this.status = 'completed';
    this.completed_at = new Date();
    this.duration_ms = this.completed_at - this.started_at;
    
    // Update statistics if provided
    if (stats.models_processed !== undefined) this.models_processed = stats.models_processed;
    if (stats.models_created !== undefined) this.models_created = stats.models_created;
    if (stats.models_updated !== undefined) this.models_updated = stats.models_updated;
    if (stats.models_removed !== undefined) this.models_removed = stats.models_removed;
    if (stats.relationships_created !== undefined) this.relationships_created = stats.relationships_created;
    if (stats.errors_count !== undefined) this.errors_count = stats.errors_count;
    
    return this.save();
  };

  ModelSyncLog.prototype.markFailed = function(error, stats = {}) {
    this.status = 'failed';
    this.completed_at = new Date();
    this.duration_ms = this.completed_at - this.started_at;
    this.error_message = error.message || String(error);
    
    if (error.stack) {
      this.error_details = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...stats
      };
    }
    
    return this.save();
  };

  // Static methods
  ModelSyncLog.createExecution = function(executionId, providerId, syncType, options = {}) {
    return this.create({
      execution_id: executionId,
      id_provider: providerId,
      sync_type: syncType,
      sync_mode: options.mode || 'manual',
      triggered_by: options.triggeredBy,
      dry_run: options.dryRun || false,
      configuration: options.configuration,
      metadata: options.metadata
    });
  };

  ModelSyncLog.getRecentLogs = function(limit = 50, providerId = null) {
    const where = {};
    if (providerId) where.id_provider = providerId;
    
    return this.findAll({
      where,
      include: [{ model: sequelize.models.Provider, as: 'provider' }],
      order: [['started_at', 'DESC']],
      limit
    });
  };

  ModelSyncLog.getExecutionStats = function(executionId) {
    return this.findAll({
      where: { execution_id: executionId },
      include: [{ model: sequelize.models.Provider, as: 'provider' }],
      order: [['started_at', 'ASC']]
    });
  };

  return ModelSyncLog;
};