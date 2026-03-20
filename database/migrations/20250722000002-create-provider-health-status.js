/**
 * Migration: Create provider_health_status table
 * 
 * This table tracks the health status and performance metrics of all AI providers,
 * enabling monitoring, alerting, and intelligent provider selection.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('provider_health_status', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      id_provider: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Provider ID',
        references: {
          model: 'providers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      status: {
        type: Sequelize.ENUM('healthy', 'degraded', 'unhealthy', 'unknown', 'maintenance'),
        allowNull: false,
        defaultValue: 'unknown',
        comment: 'Current health status of the provider'
      },
      last_check_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: 'Timestamp of the last health check'
      },
      last_success_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp of the last successful operation'
      },
      last_failure_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp of the last failure'
      },
      consecutive_failures: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of consecutive failures since last success'
      },
      consecutive_successes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of consecutive successes since last failure'
      },
      total_requests: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of requests made to this provider'
      },
      successful_requests: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of successful requests'
      },
      failed_requests: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of failed requests'
      },
      avg_response_time_ms: {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: 'Average response time in milliseconds (rolling window)'
      },
      last_response_time_ms: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Response time of the last request in milliseconds'
      },
      error_rate_percentage: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Error rate percentage (rolling window)'
      },
      availability_percentage: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 100,
        comment: 'Availability percentage (rolling window)'
      },
      last_error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Last error message encountered'
      },
      last_error_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Type of the last error (timeout, network, api_error, etc.)'
      },
      circuit_breaker_state: {
        type: Sequelize.ENUM('closed', 'open', 'half_open'),
        allowNull: false,
        defaultValue: 'closed',
        comment: 'Current circuit breaker state'
      },
      circuit_breaker_opened_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the circuit breaker was opened'
      },
      rate_limit_remaining: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Remaining rate limit quota (if available from provider)'
      },
      rate_limit_reset_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When rate limit quota resets'
      },
      models_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of active models for this provider'
      },
      last_sync_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last successful model synchronization'
      },
      next_check_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Scheduled time for next health check'
      },
      health_score: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 100,
        comment: 'Calculated health score (0-100) based on multiple metrics'
      },
      performance_metrics: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Detailed performance metrics and historical data'
      },
      configuration: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Provider-specific configuration and settings'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional metadata about the provider status'
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether health monitoring is enabled for this provider'
      },
      alerting_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether to send alerts for this provider'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Create indexes for performance
    await queryInterface.addIndex('provider_health_status', ['id_provider'], {
      unique: true,
      name: 'idx_provider_health_status_provider_unique'
    });

    await queryInterface.addIndex('provider_health_status', ['status'], {
      name: 'idx_provider_health_status_status'
    });

    await queryInterface.addIndex('provider_health_status', ['last_check_at'], {
      name: 'idx_provider_health_status_last_check'
    });

    await queryInterface.addIndex('provider_health_status', ['health_score'], {
      name: 'idx_provider_health_status_score'
    });

    await queryInterface.addIndex('provider_health_status', ['circuit_breaker_state'], {
      name: 'idx_provider_health_status_circuit_breaker'
    });

    await queryInterface.addIndex('provider_health_status', ['is_enabled', 'status'], {
      name: 'idx_provider_health_status_enabled_status'
    });

    await queryInterface.addIndex('provider_health_status', ['next_check_at'], {
      name: 'idx_provider_health_status_next_check'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('provider_health_status');
  }
};