/**
 * ProviderHealthStatus Model
 * 
 * Tracks the health status and performance metrics of all AI providers,
 * enabling monitoring, alerting, and intelligent provider selection.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProviderHealthStatus = sequelize.define('ProviderHealthStatus', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    id_provider: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      comment: 'Provider ID'
    },
    status: {
      type: DataTypes.ENUM('healthy', 'degraded', 'unhealthy', 'unknown', 'maintenance'),
      allowNull: false,
      defaultValue: 'unknown',
      comment: 'Current health status of the provider'
    },
    last_check_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Timestamp of the last health check'
    },
    last_success_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp of the last successful operation'
    },
    last_failure_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp of the last failure'
    },
    consecutive_failures: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of consecutive failures since last success'
    },
    consecutive_successes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of consecutive successes since last failure'
    },
    total_requests: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: 'Total number of requests made to this provider'
    },
    successful_requests: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: 'Total number of successful requests'
    },
    failed_requests: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: 'Total number of failed requests'
    },
    avg_response_time_ms: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Average response time in milliseconds (rolling window)'
    },
    last_response_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Response time of the last request in milliseconds'
    },
    error_rate_percentage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      comment: 'Error rate percentage (rolling window)'
    },
    availability_percentage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 100,
      comment: 'Availability percentage (rolling window)'
    },
    last_error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Last error message encountered'
    },
    last_error_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Type of the last error (timeout, network, api_error, etc.)'
    },
    circuit_breaker_state: {
      type: DataTypes.ENUM('closed', 'open', 'half_open'),
      allowNull: false,
      defaultValue: 'closed',
      comment: 'Current circuit breaker state'
    },
    circuit_breaker_opened_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the circuit breaker was opened'
    },
    rate_limit_remaining: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Remaining rate limit quota (if available from provider)'
    },
    rate_limit_reset_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When rate limit quota resets'
    },
    models_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of active models for this provider'
    },
    last_sync_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last successful model synchronization'
    },
    next_check_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Scheduled time for next health check'
    },
    health_score: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 100,
      comment: 'Calculated health score (0-100) based on multiple metrics'
    },
    performance_metrics: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Detailed performance metrics and historical data'
    },
    configuration: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Provider-specific configuration and settings'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata about the provider status'
    },
    is_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether health monitoring is enabled for this provider'
    },
    alerting_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether to send alerts for this provider'
    }
  }, {
    tableName: 'provider_health_status',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['id_provider'],
        unique: true
      },
      {
        fields: ['status']
      },
      {
        fields: ['last_check_at']
      },
      {
        fields: ['health_score']
      },
      {
        fields: ['circuit_breaker_state']
      },
      {
        fields: ['is_enabled', 'status']
      },
      {
        fields: ['next_check_at']
      }
    ]
  });

  ProviderHealthStatus.associate = (models) => {
    // Association with Provider
    ProviderHealthStatus.belongsTo(models.Provider, {
      foreignKey: 'id_provider',
      as: 'provider'
    });
  };

  // Instance methods
  ProviderHealthStatus.prototype.recordSuccess = function(responseTime = null) {
    const now = new Date();
    
    this.last_success_at = now;
    this.last_check_at = now;
    this.consecutive_successes++;
    this.consecutive_failures = 0;
    this.successful_requests++;
    this.total_requests++;
    
    if (responseTime) {
      this.last_response_time_ms = responseTime;
      // Update rolling average (simple moving average with decay)
      if (this.avg_response_time_ms) {
        this.avg_response_time_ms = (this.avg_response_time_ms * 0.8) + (responseTime * 0.2);
      } else {
        this.avg_response_time_ms = responseTime;
      }
    }
    
    // Update health metrics
    this.updateHealthMetrics();
    
    // Reset circuit breaker if needed
    if (this.circuit_breaker_state === 'half_open' && this.consecutive_successes >= 3) {
      this.circuit_breaker_state = 'closed';
      this.circuit_breaker_opened_at = null;
    }
    
    return this.save();
  };

  ProviderHealthStatus.prototype.recordFailure = function(error, errorType = 'unknown') {
    const now = new Date();
    
    this.last_failure_at = now;
    this.last_check_at = now;
    this.consecutive_failures++;
    this.consecutive_successes = 0;
    this.failed_requests++;
    this.total_requests++;
    this.last_error_message = error.message || String(error);
    this.last_error_type = errorType;
    
    // Update health metrics
    this.updateHealthMetrics();
    
    // Update circuit breaker
    if (this.consecutive_failures >= 5 && this.circuit_breaker_state === 'closed') {
      this.circuit_breaker_state = 'open';
      this.circuit_breaker_opened_at = now;
    }
    
    return this.save();
  };

  ProviderHealthStatus.prototype.updateHealthMetrics = function() {
    // Calculate error rate
    if (this.total_requests > 0) {
      this.error_rate_percentage = (this.failed_requests / this.total_requests) * 100;
      this.availability_percentage = (this.successful_requests / this.total_requests) * 100;
    }
    
    // Calculate health score based on multiple factors
    let score = 100;
    
    // Penalize for consecutive failures
    score -= Math.min(this.consecutive_failures * 10, 50);
    
    // Penalize for high error rate
    score -= Math.min(this.error_rate_percentage * 0.5, 30);
    
    // Penalize for slow response times
    if (this.avg_response_time_ms > 5000) {
      score -= 20;
    } else if (this.avg_response_time_ms > 2000) {
      score -= 10;
    }
    
    // Penalize for circuit breaker open
    if (this.circuit_breaker_state === 'open') {
      score -= 40;
    } else if (this.circuit_breaker_state === 'half_open') {
      score -= 20;
    }
    
    // Time since last success penalty
    if (this.last_success_at) {
      const timeSinceSuccess = Date.now() - this.last_success_at.getTime();
      const hoursSinceSuccess = timeSinceSuccess / (1000 * 60 * 60);
      
      if (hoursSinceSuccess > 24) {
        score -= 30;
      } else if (hoursSinceSuccess > 1) {
        score -= 10;
      }
    }
    
    this.health_score = Math.max(0, Math.min(100, score));
    
    // Update status based on health score
    if (this.health_score >= 80) {
      this.status = 'healthy';
    } else if (this.health_score >= 50) {
      this.status = 'degraded';
    } else {
      this.status = 'unhealthy';
    }
  };

  ProviderHealthStatus.prototype.scheduleNextCheck = function(intervalMinutes = 5) {
    this.next_check_at = new Date(Date.now() + (intervalMinutes * 60 * 1000));
    return this.save();
  };

  // Static methods
  ProviderHealthStatus.getHealthyProviders = function() {
    return this.findAll({
      where: {
        status: ['healthy', 'degraded'],
        is_enabled: true
      },
      include: [{ model: sequelize.models.Provider, as: 'provider' }],
      order: [['health_score', 'DESC']]
    });
  };

  ProviderHealthStatus.getProvidersNeedingCheck = function() {
    return this.findAll({
      where: {
        is_enabled: true,
        next_check_at: {
          [sequelize.Sequelize.Op.lte]: new Date()
        }
      },
      include: [{ model: sequelize.models.Provider, as: 'provider' }],
      order: [['next_check_at', 'ASC']]
    });
  };

  ProviderHealthStatus.initializeProvider = function(providerId) {
    return this.upsert({
      id_provider: providerId,
      status: 'unknown',
      last_check_at: new Date(),
      health_score: 100,
      is_enabled: true,
      alerting_enabled: true
    });
  };

  return ProviderHealthStatus;
};