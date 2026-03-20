# Model Management System Troubleshooting Guide

This document provides guidance for common operational scenarios and troubleshooting steps for the Model Management System.

## Table of Contents

1. [Common Operational Tasks](#common-operational-tasks)
   - [Manual Synchronization](#manual-synchronization)
   - [Health Checks](#health-checks)
   - [Database Backups](#database-backups)
   - [Log Management](#log-management)
   
2. [Troubleshooting](#troubleshooting)
   - [Failed Synchronization](#failed-synchronization)
   - [Provider API Issues](#provider-api-issues)
   - [Database Connection Problems](#database-connection-problems)
   - [Performance Issues](#performance-issues)
   
3. [Monitoring and Alerts](#monitoring-and-alerts)
   - [Alert Types](#alert-types)
   - [Alert Response Procedures](#alert-response-procedures)
   
4. [Recovery Procedures](#recovery-procedures)
   - [Database Restoration](#database-restoration)
   - [Provider Recovery](#provider-recovery)
   - [System Restart](#system-restart)

## Common Operational Tasks

### Manual Synchronization

To manually trigger a synchronization of models from all providers:

```bash
# Update all providers
node scripts/model-management/cli/index.js sync

# Update specific provider(s)
node scripts/model-management/cli/index.js sync --provider openai,anthropic

# Perform full sync (not incremental)
node scripts/model-management/cli/index.js sync --full

# Dry run (no database changes)
node scripts/model-management/cli/index.js sync --dry-run
```

### Health Checks

To check the health of the model management system and providers:

```bash
# Check all providers
node scripts/model-management/cli/index.js health

# Check specific provider(s)
node scripts/model-management/cli/index.js health --provider openai,anthropic

# Detailed health information
node scripts/model-management/cli/index.js health --detailed

# Attempt to fix unhealthy providers
node scripts/model-management/cli/index.js health --fix
```

### Database Backups

To manually create a database backup:

```bash
# Backup all model management tables
node scripts/model-management/cronjobs/backup-database.js

# Backup specific tables
node scripts/model-management/cronjobs/backup-database.js --tables models,providers

# Verbose output
node scripts/model-management/cronjobs/backup-database.js --verbose
```

### Log Management

To view and manage system logs:

```bash
# View recent logs
node scripts/model-management/cli/index.js logs

# Follow log output
node scripts/model-management/cli/index.js logs --follow

# Filter by log level
node scripts/model-management/cli/index.js logs --level error

# Trigger log rotation
node scripts/model-management/cli/index.js logs --rotate
```

## Troubleshooting

### Failed Synchronization

If a synchronization job fails:

1. Check the logs for error messages:
   ```bash
   cat logs/model-management/error.log | grep -i sync
   ```

2. Verify provider API keys are valid:
   ```bash
   node scripts/model-management/cli/index.js providers --test openai
   ```

3. Check for rate limiting or API availability issues:
   ```bash
   node scripts/model-management/cli/index.js health --provider openai --detailed
   ```

4. Try running with verbose output for more details:
   ```bash
   node scripts/model-management/cli/index.js sync --provider openai --verbose
   ```

5. Check database connectivity:
   ```bash
   node -e "require('./database').sequelize.authenticate().then(() => console.log('Connection OK')).catch(err => console.error('Failed:', err))"
   ```

### Provider API Issues

If a provider API is experiencing issues:

1. Check provider health status:
   ```bash
   node scripts/model-management/cli/index.js health --provider openai --detailed
   ```

2. Verify API key validity:
   ```bash
   node scripts/model-management/cli/index.js providers --test openai
   ```

3. Check provider status page (if available):
   - OpenAI: https://status.openai.com/
   - Anthropic: https://status.anthropic.com/
   - Together.ai: https://status.together.ai/

4. Temporarily disable the provider if needed:
   ```bash
   node scripts/model-management/cli/index.js providers --disable openai
   ```

5. Re-enable when issues are resolved:
   ```bash
   node scripts/model-management/cli/index.js providers --enable openai
   ```

### Database Connection Problems

If database connection issues occur:

1. Verify database credentials in config/database.js

2. Check database server status:
   ```bash
   mysqladmin -u root -p status
   ```

3. Test connection from application:
   ```bash
   node -e "require('./database').sequelize.authenticate().then(() => console.log('Connection OK')).catch(err => console.error('Failed:', err))"
   ```

4. Check for connection limits or resource constraints:
   ```sql
   SHOW VARIABLES LIKE 'max_connections';
   SHOW STATUS LIKE 'Threads_connected';
   ```

5. Restart database service if needed:
   ```bash
   sudo systemctl restart mysql
   ```

### Performance Issues

If the system is experiencing performance issues:

1. Check system resource usage:
   ```bash
   top -c -p $(pgrep -d',' -f node)
   ```

2. Monitor database performance:
   ```bash
   mysqladmin -u root -p extended-status -i 5
   ```

3. Check for slow queries:
   ```sql
   SHOW FULL PROCESSLIST;
   ```

4. Review performance logs:
   ```bash
   cat logs/model-management/performance.log
   ```

5. Adjust batch size for large operations:
   ```bash
   node scripts/model-management/cli/index.js sync --parallel 2
   ```

## Monitoring and Alerts

### Alert Types

The system generates the following types of alerts:

1. **sync_job_failure**: A scheduled synchronization job failed
2. **health_check_failure**: A health check operation failed
3. **unhealthy_providers**: One or more providers are in unhealthy state
4. **missed_sync_job**: A scheduled synchronization job was missed
5. **significant_model_changes**: Large number of model changes detected
6. **high_memory_usage**: System memory usage exceeds threshold
7. **database_connection_failure**: Database connection issues detected

### Alert Response Procedures

For each alert type, follow these procedures:

#### sync_job_failure

1. Check error logs for details:
   ```bash
   cat logs/model-management/error.log | grep -i "sync operation failed"
   ```

2. Verify provider API status and credentials
3. Run manual sync with verbose output to diagnose:
   ```bash
   node scripts/model-management/cli/index.js sync --verbose
   ```

4. Fix any identified issues and re-run the sync job

#### unhealthy_providers

1. Check which providers are affected:
   ```bash
   node scripts/model-management/cli/index.js health --detailed
   ```

2. Verify API keys and rate limits
3. Check provider status pages for outages
4. Try provider-specific health check:
   ```bash
   node scripts/model-management/cli/index.js health --provider openai --detailed
   ```

5. Attempt automatic fixes:
   ```bash
   node scripts/model-management/cli/index.js health --fix
   ```

#### missed_sync_job

1. Check if cron service is running:
   ```bash
   systemctl status cron
   ```

2. Verify crontab entries:
   ```bash
   crontab -l
   ```

3. Check for system resource constraints during scheduled time
4. Run manual sync to catch up:
   ```bash
   node scripts/model-management/cli/index.js sync
   ```

5. Verify next scheduled run:
   ```bash
   node scripts/model-management/cli/index.js status
   ```

## Recovery Procedures

### Database Restoration

To restore from a backup:

1. Locate the backup directory:
   ```bash
   ls -la backups/model-management/
   ```

2. Choose the backup to restore:
   ```bash
   ls -la backups/model-management/model-management-backup-2025-07-22T02-00-00-000Z/
   ```

3. Restore specific tables:
   ```bash
   node scripts/model-management/cli/index.js maintenance --restore backups/model-management/model-management-backup-2025-07-22T02-00-00-000Z/ --tables models,providers
   ```

4. Verify restoration:
   ```bash
   node scripts/model-management/cli/index.js models --list
   ```

### Provider Recovery

To recover a provider after persistent failures:

1. Reset provider health status:
   ```bash
   node scripts/model-management/cli/index.js providers --reset openai
   ```

2. Update API credentials if needed:
   ```bash
   node scripts/model-management/cli/index.js config --set openai.apiKey=sk-newkey
   ```

3. Test provider connection:
   ```bash
   node scripts/model-management/cli/index.js providers --test openai
   ```

4. Re-enable provider:
   ```bash
   node scripts/model-management/cli/index.js providers --enable openai
   ```

5. Trigger synchronization:
   ```bash
   node scripts/model-management/cli/index.js sync --provider openai
   ```

### System Restart

To perform a complete system restart:

1. Stop all running processes:
   ```bash
   pm2 stop all
   ```

2. Clear any temporary files:
   ```bash
   node scripts/model-management/cli/index.js maintenance --cleanup
   ```

3. Restart database if needed:
   ```bash
   sudo systemctl restart mysql
   ```

4. Start application services:
   ```bash
   pm2 start ecosystem.config.js
   ```

5. Verify system health:
   ```bash
   node scripts/model-management/cli/index.js health
   node scripts/model-management/cli/index.js status
   ```

6. Trigger initial synchronization:
   ```bash
   node scripts/model-management/cli/index.js sync
   ```