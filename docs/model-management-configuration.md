# Model Management System - Configuration Guide

This document provides detailed information on configuring and deploying the Model Management System in various environments.

## Table of Contents

- [Configuration Options](#configuration-options)
- [Environment Variables](#environment-variables)
- [Configuration Files](#configuration-files)
- [Provider Configuration](#provider-configuration)
- [Deployment Scenarios](#deployment-scenarios)
- [Production Setup](#production-setup)
- [Monitoring Integration](#monitoring-integration)
- [Backup and Recovery](#backup-and-recovery)

## Configuration Options

The Model Management System offers multiple layers of configuration:

1. **Environment Variables**: For system-wide settings and credentials
2. **Configuration Files**: For persistent settings and customizations
3. **CLI Parameters**: For runtime overrides and specific operations
4. **Database Settings**: For provider-specific configurations

## Environment Variables

### Core Settings

```bash
# Logging configuration
MODEL_MGMT_LOG_LEVEL=info           # Log level (error, warn, info, debug)
MODEL_MGMT_LOG_DIR=/var/log/model-management  # Log directory
MODEL_MGMT_LOG_ROTATION=true        # Enable log rotation
MODEL_MGMT_LOG_MAX_SIZE=50m         # Maximum log file size
MODEL_MGMT_LOG_RETENTION=30d        # Log retention period

# Operational settings
MODEL_MGMT_PARALLEL=3               # Default parallelism
MODEL_MGMT_TIMEOUT=300000           # Default timeout (ms)
MODEL_MGMT_AUTO_CONFIRM=false       # Auto-confirm operations
MODEL_MGMT_DRY_RUN=false            # Default to dry run mode
MODEL_MGMT_BATCH_SIZE=100           # Database batch size

# Scheduler settings
MODEL_MGMT_SCHEDULER_ENABLED=true   # Enable scheduler
MODEL_MGMT_FULL_SYNC_CRON="0 2 * * 0"       # Weekly at 2 AM Sunday
MODEL_MGMT_INCREMENTAL_SYNC_CRON="0 */6 * * *"  # Every 6 hours
MODEL_MGMT_HEALTH_CHECK_CRON="*/15 * * * *"    # Every 15 minutes
MODEL_MGMT_CLEANUP_CRON="0 3 * * *"           # Daily at 3 AM

# Display preferences
MODEL_MGMT_THEME=default            # CLI theme
MODEL_MGMT_COLORS=true              # Enable colors
MODEL_MGMT_PROGRESS_BAR=true        # Show progress bars
```

### Provider API Keys

```bash
# Provider API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
TOGETHER_API_KEY=...
OPENROUTER_API_KEY=...
DEEPSEEK_API_KEY=...
IDEOGRAM_API_KEY=...
```

### Advanced Settings

```bash
# Circuit breaker configuration
MODEL_MGMT_CIRCUIT_BREAKER_THRESHOLD=5     # Failure threshold
MODEL_MGMT_CIRCUIT_BREAKER_TIMEOUT=60000   # Reset timeout (ms)

# Retry configuration
MODEL_MGMT_RETRY_ATTEMPTS=3                # Maximum retry attempts
MODEL_MGMT_RETRY_INITIAL_DELAY=1000        # Initial retry delay (ms)
MODEL_MGMT_RETRY_BACKOFF_FACTOR=2          # Backoff multiplier

# Performance tuning
MODEL_MGMT_DB_POOL_SIZE=10                 # Database connection pool size
MODEL_MGMT_CACHE_ENABLED=true              # Enable caching
MODEL_MGMT_CACHE_TTL=3600                  # Cache TTL (seconds)
```

## Configuration Files

### Main Configuration File

Location: `~/.model-management/config.json`

```json
{
  "display": {
    "theme": "default",
    "showTimestamps": true,
    "showColors": true,
    "progressBarStyle": "standard"
  },
  "operations": {
    "defaultParallelism": 3,
    "defaultTimeout": 300000,
    "autoConfirm": false,
    "retryAttempts": 3,
    "batchSize": 100
  },
  "logging": {
    "level": "info",
    "directory": "/var/log/model-management",
    "rotation": true,
    "maxSize": "50m",
    "retention": "30d",
    "format": "json"
  },
  "scheduler": {
    "enabled": true,
    "fullSync": "0 2 * * 0",
    "incrementalSync": "0 */6 * * *",
    "healthCheck": "*/15 * * * *",
    "cleanup": "0 3 * * *"
  },
  "providers": {
    "openai": {
      "priority": 1,
      "syncInterval": "0 */4 * * *",
      "healthCheckInterval": "*/10 * * * *",
      "maintenanceWindow": {
        "daily": { "start": 2, "end": 4 }
      },
      "retryConfig": {
        "attempts": 3,
        "backoffMultiplier": 2,
        "initialDelay": 60000
      }
    },
    "anthropic": {
      "priority": 2,
      "syncInterval": "0 */6 * * *",
      "healthCheckInterval": "*/15 * * * *"
    },
    "together": {
      "priority": 3,
      "syncInterval": "0 */8 * * *",
      "healthCheckInterval": "*/20 * * * *"
    },
    "openrouter": {
      "priority": 4,
      "syncInterval": "0 */12 * * *",
      "healthCheckInterval": "*/30 * * * *"
    },
    "deepseek": {
      "priority": 5,
      "syncInterval": "0 */8 * * *",
      "healthCheckInterval": "*/20 * * * *"
    },
    "ideogram": {
      "priority": 6,
      "syncInterval": "0 */12 * * *",
      "healthCheckInterval": "*/30 * * * *"
    }
  },
  "circuitBreaker": {
    "failureThreshold": 5,
    "resetTimeout": 60000,
    "monitoringPeriod": 30000
  },
  "retry": {
    "maxRetries": 3,
    "initialDelay": 1000,
    "maxDelay": 30000,
    "factor": 2,
    "jitter": 0.1
  },
  "performance": {
    "dbPoolSize": 10,
    "cacheEnabled": true,
    "cacheTTL": 3600
  },
  "alerting": {
    "enabled": false,
    "email": "",
    "slack": "",
    "webhook": ""
  }
}
```

### Environment-Specific Configuration

Location: `config/model-management.{environment}.js`

Example for production:

```javascript
// config/model-management.production.js
module.exports = {
  logging: {
    level: 'warn',
    directory: '/var/log/model-management',
    rotation: true,
    maxSize: '100m',
    retention: '90d'
  },
  operations: {
    defaultParallelism: 5,
    batchSize: 200
  },
  performance: {
    dbPoolSize: 20,
    cacheEnabled: true,
    cacheTTL: 7200
  },
  alerting: {
    enabled: true,
    email: 'alerts@company.com',
    slack: 'https://hooks.slack.com/services/...',
    webhook: 'https://alerts.company.com/webhook'
  }
};
```

## Provider Configuration

### Provider Settings in Database

Providers are configured in the database with the following fields:

| Field | Description | Example |
|-------|-------------|---------|
| `name` | Provider identifier | `openai` |
| `provider_type` | Provider type | `direct` or `aggregator` |
| `api_url` | API endpoint URL | `https://api.openai.com/v1` |
| `api_version` | API version | `v1` |
| `is_active` | Provider status | `true` or `false` |
| `priority` | Sync priority (lower is higher) | `1` |
| `metadata` | Additional settings (JSON) | See below |

### Provider Metadata

The `metadata` field can contain provider-specific settings:

```json
{
  "rateLimit": {
    "requests": 100,
    "window": 60000
  },
  "timeout": 30000,
  "retryConfig": {
    "attempts": 3,
    "backoffMultiplier": 2,
    "initialDelay": 60000
  },
  "maintenanceWindow": {
    "daily": { "start": 2, "end": 4 }
  },
  "modelMapping": {
    "gpt-4": "gpt-4-0613",
    "claude-3": "claude-3-opus-20240229"
  }
}
```

### Adding a New Provider

To add a new provider:

1. **Create provider adapter**:
   - Implement in `services/model-management/adapters/`
   - Follow the provider adapter interface

2. **Register provider in database**:
   ```sql
   INSERT INTO providers (name, provider_type, api_url, is_active)
   VALUES ('new-provider', 'direct', 'https://api.new-provider.com', true);
   ```

3. **Configure provider settings**:
   ```bash
   npm run model-mgmt providers --update new-provider --set "priority=5"
   ```

4. **Test provider connection**:
   ```bash
   npm run model-mgmt providers --test new-provider
   ```

## Deployment Scenarios

### Development Environment

```bash
# Install dependencies
npm install

# Run database migrations
npm run migration:up

# Initialize providers
npm run init-providers

# Start in development mode
NODE_ENV=development npm run model-mgmt:interactive
```

### Testing Environment

```bash
# Install dependencies
npm install

# Run database migrations
npm run migration:up

# Initialize providers with test data
npm run init-providers
npm run model-mgmt sync --dry-run

# Run tests
npm test
```

### Staging Environment

```bash
# Install dependencies
npm ci

# Run database migrations
NODE_ENV=staging npm run migration:up

# Initialize providers
NODE_ENV=staging npm run init-providers

# Sync models
NODE_ENV=staging npm run model-mgmt sync --parallel 3
```

### Production Environment

```bash
# Install dependencies
npm ci --only=production

# Run database migrations
NODE_ENV=production npm run migration:up

# Initialize providers (if needed)
NODE_ENV=production npm run init-providers

# Start scheduler
NODE_ENV=production npm run model-mgmt:scheduler:start
```

## Production Setup

### System Requirements

- **Node.js**: v16.0.0 or higher
- **Database**: MySQL 8.0+ with InnoDB
- **Memory**: 4GB minimum, 8GB recommended
- **CPU**: 2 cores minimum, 4 cores recommended
- **Disk**: 20GB minimum for logs and data

### Installation Steps

1. **Clone repository**:
   ```bash
   git clone https://github.com/your-org/aigens-backend.git
   cd aigens-backend
   ```

2. **Install dependencies**:
   ```bash
   npm ci --only=production
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with production settings
   ```

4. **Run database migrations**:
   ```bash
   NODE_ENV=production npm run migration:up
   ```

5. **Initialize providers**:
   ```bash
   NODE_ENV=production npm run init-providers
   ```

6. **Verify setup**:
   ```bash
   NODE_ENV=production npm run verify-setup
   ```

7. **Start scheduler**:
   ```bash
   NODE_ENV=production npm run model-mgmt:scheduler:start
   ```

### Process Management

For production deployments, use a process manager like PM2:

```bash
# Install PM2
npm install -g pm2

# Start scheduler with PM2
pm2 start npm --name "model-mgmt-scheduler" -- run model-mgmt:scheduler:start

# Start monitoring service
pm2 start npm --name "model-mgmt-monitor" -- run model-mgmt:monitor

# Save PM2 configuration
pm2 save

# Configure PM2 to start on system boot
pm2 startup
```

### Cron Configuration

For systems without PM2, use crontab:

```bash
# Edit crontab
crontab -e

# Add the following entries:

# Full sync weekly on Sunday at 2 AM
0 2 * * 0 cd /path/to/aigens-backend && NODE_ENV=production npm run model-mgmt sync --full

# Incremental sync every 6 hours
0 */6 * * * cd /path/to/aigens-backend && NODE_ENV=production npm run model-mgmt sync

# Health check every 15 minutes
*/15 * * * * cd /path/to/aigens-backend && NODE_ENV=production npm run model-mgmt health

# System cleanup daily at 3 AM
0 3 * * * cd /path/to/aigens-backend && NODE_ENV=production npm run model-mgmt maintenance --cleanup
```

## Monitoring Integration

### Prometheus Integration

1. **Install Prometheus client**:
   ```bash
   npm install prom-client
   ```

2. **Configure metrics endpoint**:
   ```javascript
   // In server.js or similar
   const promClient = require('prom-client');
   const { getMonitoringService } = require('./services/model-management/monitoring-service');
   
   app.get('/metrics', async (req, res) => {
     const monitoring = getMonitoringService();
     const metrics = await monitoring.getPrometheusMetrics();
     res.set('Content-Type', promClient.register.contentType);
     res.end(metrics);
   });
   ```

3. **Configure Prometheus**:
   ```yaml
   # prometheus.yml
   scrape_configs:
     - job_name: 'model-management'
       scrape_interval: 30s
       static_configs:
         - targets: ['localhost:3000']
       metrics_path: '/metrics'
   ```

### Grafana Dashboard

Create a Grafana dashboard with the following panels:

1. **System Health**:
   - Provider health status
   - Sync success rate
   - Error rate

2. **Performance Metrics**:
   - Sync duration
   - API response time
   - Database query time

3. **Resource Usage**:
   - Memory usage
   - CPU usage
   - Database connections

4. **Provider Metrics**:
   - Models count by provider
   - Sync frequency
   - Error rate by provider

### Alert Configuration

Configure alerts for critical conditions:

1. **Provider Health**:
   - Alert when provider health status is "unhealthy" for more than 15 minutes
   - Alert when error rate exceeds 10%

2. **Sync Failures**:
   - Alert when sync fails consecutively 3 times
   - Alert when sync hasn't run for more than 12 hours

3. **System Resources**:
   - Alert when memory usage exceeds 85%
   - Alert when disk space is below 10%

## Backup and Recovery

### Database Backup

1. **Regular backups**:
   ```bash
   # Daily database backup
   0 1 * * * mysqldump -h <db_host> -u <db_user> -p<db_password> <db_name> > /backups/model-mgmt-$(date +\%Y\%m\%d).sql
   ```

2. **Configuration backup**:
   ```bash
   # Weekly configuration backup
   0 0 * * 0 cp ~/.model-management/config.json /backups/model-mgmt-config-$(date +\%Y\%m\%d).json
   ```

### System State Backup

Use the built-in backup feature:

```bash
# Create system state backup
npm run model-mgmt maintenance --backup --output /backups/model-mgmt-state-$(date +%Y%m%d).json
```

### Recovery Procedures

1. **Database recovery**:
   ```bash
   # Restore database from backup
   mysql -h <db_host> -u <db_user> -p<db_password> <db_name> < /backups/model-mgmt-20250722.sql
   ```

2. **Configuration recovery**:
   ```bash
   # Restore configuration
   cp /backups/model-mgmt-config-20250722.json ~/.model-management/config.json
   ```

3. **System state recovery**:
   ```bash
   # Restore system state
   npm run model-mgmt maintenance --restore /backups/model-mgmt-state-20250722.json
   ```

4. **Verify recovery**:
   ```bash
   # Verify system status
   npm run model-mgmt:status
   
   # Verify provider health
   npm run model-mgmt:health
   
   # Verify model count
   npm run model-mgmt models --list | wc -l
   ```

---

This configuration guide provides comprehensive information for setting up and maintaining the Model Management System in various environments. For additional assistance, please refer to the other documentation files or contact the development team.