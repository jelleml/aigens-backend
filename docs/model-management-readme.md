# Model Management System - User Guide

## Overview

The Model Management System is a comprehensive solution for synchronizing, monitoring, and managing AI models from multiple providers (OpenAI, Anthropic, Together.ai, OpenRouter, DeepSeek, Ideogram). It provides a unified interface for model initialization, updates, and health monitoring through an interactive CLI, automated scheduling, and robust error handling.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Command Line Interface](#command-line-interface)
- [Automated Synchronization](#automated-synchronization)
- [Health Monitoring](#health-monitoring)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

## Installation

1. Ensure you have Node.js 16+ installed
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run database migrations:
   ```bash
   npm run migration:up
   ```
4. Initialize providers (if needed):
   ```bash
   npm run init-providers
   ```

## Quick Start

### Interactive Mode

The easiest way to get started is with interactive mode:

```bash
npm run model-mgmt:interactive
```

This launches a menu-driven interface for all model management operations.

### Basic Commands

```bash
# Check system status
npm run model-mgmt:status

# Sync all models from all providers
npm run sync:all

# Check provider health
npm run model-mgmt:health

# List all models
npm run model-mgmt:models
```

## Command Line Interface

The Model Management System provides a comprehensive CLI for all operations.

### Sync Operations

```bash
# Sync all providers
npm run model-mgmt sync

# Sync specific provider
npm run sync:openai
npm run sync:anthropic
npm run sync:together
npm run sync:openrouter
npm run sync:deepseek
npm run sync:ideogram

# Full sync (not incremental)
npm run model-mgmt sync --full

# Sync with higher concurrency
npm run model-mgmt sync --parallel 5

# Dry run (no changes)
npm run model-mgmt sync --dry-run
```

### Health Monitoring

```bash
# Quick health check
npm run model-mgmt:health

# Detailed health information
npm run model-mgmt health --detailed

# Check specific provider and attempt fixes
npm run model-mgmt health --provider openai --fix

# Continuous health monitoring
npm run model-mgmt:monitor
```

### Provider Management

```bash
# List all providers with status
npm run model-mgmt:providers

# Enable/disable providers
npm run model-mgmt providers --enable anthropic
npm run model-mgmt providers --disable together

# Test provider connection
npm run model-mgmt providers --test openai
```

### Model Management

```bash
# List all models
npm run model-mgmt:models

# Filter by provider and status
npm run model-mgmt models --provider openai --active

# Search models
npm run model-mgmt models --search "gpt-4"
```

### System Metrics

```bash
# View system metrics
npm run model-mgmt:metrics

# Watch metrics in real-time
npm run model-mgmt metrics --watch --interval 5

# Export metrics
npm run model-mgmt metrics --export json --output metrics.json
```

### Log Management

```bash
# View recent logs
npm run model-mgmt:logs

# Follow logs in real-time
npm run model-mgmt logs --follow

# Filter logs by level
npm run model-mgmt logs --level error

# Rotate logs
npm run model-mgmt logs --rotate
```

### Configuration

```bash
# Show current configuration
npm run model-mgmt:config

# Update configuration
npm run model-mgmt config --set "operations.defaultParallelism=5"

# Reset to defaults
npm run model-mgmt config --reset

# Edit in default editor
npm run model-mgmt config --edit
```

### Maintenance

```bash
# Run system maintenance
npm run model-mgmt:maintenance

# Clean up old logs and temporary files
npm run model-mgmt maintenance --cleanup

# Create system backup
npm run model-mgmt maintenance --backup

# Restore from backup
npm run model-mgmt maintenance --restore backup-file.json
```

## Automated Synchronization

The system supports automated synchronization through scheduled jobs.

### Starting the Scheduler

```bash
# Start the scheduler with default settings
npm run model-mgmt:scheduler:start

# Stop the scheduler
npm run model-mgmt:scheduler:stop
```

### Default Schedules

- **Full Sync**: Weekly on Sunday at 2:00 AM UTC
- **Incremental Sync**: Every 6 hours
- **Health Checks**: Every 15 minutes
- **System Cleanup**: Daily at 3:00 AM UTC

### Provider-Specific Schedules

Some providers have custom schedules:

- **OpenAI**: Every 4 hours
- **Anthropic**: Every 6 hours
- **Together.ai**: Every 8 hours

## Health Monitoring

The system continuously monitors the health of all providers and the overall system.

### Health Metrics

- **Provider Status**: Healthy, Degraded, Unhealthy
- **Response Time**: Average, Min, Max
- **Error Rate**: Percentage of failed requests
- **Circuit Breaker**: Open, Closed, Half-Open
- **Models Count**: Number of active models

### Continuous Monitoring

```bash
# Start continuous monitoring
npm run model-mgmt:monitor
```

This will check provider health every 60 seconds and display status updates.

## Configuration

### Environment Variables

```bash
# Logging configuration
MODEL_MGMT_LOG_LEVEL=info
MODEL_MGMT_LOG_DIR=/var/log/model-management

# Operational settings
MODEL_MGMT_PARALLEL=3
MODEL_MGMT_TIMEOUT=300000
MODEL_MGMT_AUTO_CONFIRM=false
MODEL_MGMT_DRY_RUN=false
```

### Configuration File

The system uses a configuration file at `~/.model-management/config.json` for persistent settings.

```json
{
  "display": {
    "theme": "default",
    "showTimestamps": true,
    "showColors": true
  },
  "operations": {
    "defaultParallelism": 3,
    "defaultTimeout": 300000,
    "autoConfirm": false,
    "retryAttempts": 3
  },
  "providers": {
    "openai": {
      "priority": 1,
      "syncInterval": "0 */4 * * *"
    }
  }
}
```

## Troubleshooting

### Common Issues

#### Sync Failures

**Issue**: Sync operation fails with API errors
**Solution**:
1. Check provider API key validity
2. Verify network connectivity
3. Check for rate limiting (use `--provider` flag to sync one provider at a time)
4. Use `--dry-run` to test without making changes

#### Database Errors

**Issue**: Database connection or query errors
**Solution**:
1. Verify database connection settings
2. Check for database migrations (`npm run migration:up`)
3. Ensure database user has proper permissions
4. Check disk space for database server

#### Memory Issues

**Issue**: High memory usage or out-of-memory errors
**Solution**:
1. Reduce parallelism (`--parallel 2`)
2. Sync providers individually
3. Increase Node.js memory limit (`NODE_OPTIONS=--max-old-space-size=4096`)
4. Check for memory leaks with heap snapshots

#### Provider-Specific Issues

**Issue**: Specific provider consistently fails
**Solution**:
1. Check provider health (`npm run model-mgmt health --provider <name>`)
2. Verify API key for that provider
3. Check provider status page for outages
4. Try provider-specific fix (`npm run model-mgmt health --provider <name> --fix`)

### Diagnostic Commands

```bash
# Check system status
npm run model-mgmt:status

# View detailed health information
npm run model-mgmt health --detailed

# Check logs for errors
npm run model-mgmt logs --level error

# Test provider connection
npm run model-mgmt providers --test <provider>
```

### Log Files

Log files are stored in the `logs/model-management/` directory:

- `combined.log`: All log entries
- `error.log`: Error-level entries only
- `exceptions.log`: Uncaught exceptions
- `rejections.log`: Unhandled promise rejections
- `performance.log`: Performance metrics

## FAQ

### General Questions

#### Q: How often should I sync models?
**A**: The system automatically syncs incrementally every 6 hours and performs a full sync weekly. This is usually sufficient, but you can trigger manual syncs as needed.

#### Q: How do I add a new provider?
**A**: New providers require implementation in the provider adapters. Contact the development team to add support for new providers.

#### Q: Can I customize sync schedules?
**A**: Yes, you can modify the schedules in the configuration file or by setting environment variables.

#### Q: How do I know if a sync was successful?
**A**: Check the sync logs (`npm run model-mgmt logs`) or view the sync status (`npm run model-mgmt:status`).

### Troubleshooting Questions

#### Q: What should I do if a provider consistently fails?
**A**: First check the provider's status page for outages. Then verify your API key and network connectivity. You can also try the repair function: `npm run model-mgmt health --provider <name> --fix`.

#### Q: How do I resolve database connection issues?
**A**: Verify your database credentials and connection settings. Ensure the database server is running and accessible. Check for any firewall rules that might be blocking connections.

#### Q: What causes high memory usage during syncs?
**A**: Processing large numbers of models can consume significant memory. Try reducing parallelism (`--parallel 2`) or syncing providers individually.

#### Q: How do I fix "Circuit breaker open" errors?
**A**: The circuit breaker opens after multiple consecutive failures to protect the system. Wait for the automatic reset (usually 1 minute) or manually reset it with `npm run model-mgmt health --provider <name> --fix`.

### Advanced Questions

#### Q: How do I integrate the model management system with my monitoring tools?
**A**: The system exposes metrics that can be consumed by Prometheus or similar tools. Use the metrics export feature: `npm run model-mgmt metrics --export json --output metrics.json`.

#### Q: Can I run the system in a Docker container?
**A**: Yes, the system is containerization-friendly. Ensure you mount volumes for logs and configuration persistence.

#### Q: How do I scale the system for large numbers of models?
**A**: Increase database connection pool size, adjust batch processing size, and consider horizontal scaling with load balancing.

#### Q: How do I backup the system configuration?
**A**: Use the backup feature: `npm run model-mgmt maintenance --backup`. This creates a complete backup of the configuration and database schema.

## Support

For additional support or questions, please contact the development team or refer to the detailed documentation in the `docs/` directory.