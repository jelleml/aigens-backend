#!/usr/bin/env node

/**
 * Model Management CLI - Main Entry Point
 * 
 * Unified command-line interface for manual execution of model management
 * operations with provider selection, progress indicators, and interactive mode.
 */

const { Command } = require('commander');
const { ModelManagementCLI } = require('./cli-core');
const MonitoringService = require('../monitoring-service');
const pkg = require('../../../package.json');

/**
 * Main CLI entry point
 */
async function main() {


  const program = new Command();
  const monitoring = MonitoringService.getMonitoringService();
  const logger = monitoring.getLogger('cli-main');

  // Initialize CLI core
  const cli = new ModelManagementCLI({
    monitoring,
    version: pkg.version || '1.0.0'
  });

  // Global CLI configuration
  program
    .name('model-mgmt')
    .description('AI Model Management System CLI')
    .version(pkg.version || '1.0.0')
    .option('-v, --verbose', 'Enable verbose output')
    .option('-q, --quiet', 'Suppress all output except errors')
    .option('--dry-run', 'Show what would be done without executing')
    .option('--config <path>', 'Path to configuration file')
    .option('--log-level <level>', 'Set log level (error, warn, info, debug)', 'info')
    .hook('preAction', (thisCommand) => {

      // Configure logging based on options
      const opts = thisCommand.opts();
      if (opts.quiet) {
        monitoring.getLogger().config.level = 'error';
      } else if (opts.verbose) {
        monitoring.getLogger().config.level = 'debug';
      } else if (opts.logLevel) {
        monitoring.getLogger().config.level = opts.logLevel;
      }
    });

  // Sync command
  program
    .command('sync')
    .description('Synchronize models from providers')
    .option('-p, --provider <providers...>', 'Specific provider(s) to sync')
    .option('-t, --type <type>', 'Filter by provider type (openai, anthropic, etc.)')
    .option('-f, --full', 'Perform full sync (not incremental)')
    .option('-j, --parallel <count>', 'Number of parallel operations', '3')
    .option('--timeout <ms>', 'Operation timeout in milliseconds', '300000')
    .action(async (options) => {
      await cli.executeSync(options, program.opts());
    });

  // Health command
  program
    .command('health')
    .description('Check system and provider health')
    .option('-p, --provider <providers...>', 'Check specific provider(s)')
    .option('-d, --detailed', 'Show detailed health information')
    .option('--fix', 'Attempt to fix unhealthy providers')
    .action(async (options) => {
      await cli.executeHealth(options, program.opts());
    });

  // Metrics command
  program
    .command('metrics')
    .description('Display system metrics and statistics')
    .option('-w, --watch', 'Watch metrics in real-time')
    .option('-i, --interval <seconds>', 'Update interval for watch mode', '5')
    .option('--export <format>', 'Export metrics (json, csv)')
    .option('--output <file>', 'Output file for export')
    .action(async (options) => {
      await cli.executeMetrics(options, program.opts());
    });

  // Logs command
  program
    .command('logs')
    .description('View and manage system logs')
    .option('-f, --follow', 'Follow log output')
    .option('-n, --lines <count>', 'Number of lines to show', '50')
    .option('--level <level>', 'Filter by log level')
    .option('--component <name>', 'Filter by component name')
    .option('--since <time>', 'Show logs since time (e.g., "1h", "2023-01-01")')
    .option('--rotate', 'Trigger log rotation')
    .action(async (options) => {
      await cli.executeLogs(options, program.opts());
    });

  // Providers command
  program
    .command('providers')
    .description('Manage AI providers')
    .option('-l, --list', 'List all providers')
    .option('-s, --status', 'Show provider status')
    .option('--enable <provider>', 'Enable a provider')
    .option('--disable <provider>', 'Disable a provider')
    .option('--test <provider>', 'Test provider connection')
    .action(async (options) => {
      await cli.executeProviders(options, program.opts());
    });

  // Models command
  program
    .command('models')
    .description('Manage AI models')
    .option('-l, --list', 'List all models')
    .option('-p, --provider <provider>', 'Filter by provider')
    .option('-t, --type <type>', 'Filter by model type')
    .option('--active', 'Show only active models')
    .option('--deprecated', 'Show deprecated models')
    .option('--search <query>', 'Search models by name or description')
    .action(async (options) => {
      await cli.executeModels(options, program.opts());
    });

  // Interactive command
  program
    .command('interactive')
    .alias('i')
    .description('Start interactive mode')
    .action(async (options) => {
      await cli.startInteractiveMode(options, program.opts());
    });

  // Config command
  program
    .command('config')
    .description('Manage CLI configuration')
    .option('--show', 'Show current configuration')
    .option('--set <key=value>', 'Set configuration value')
    .option('--reset', 'Reset to default configuration')
    .option('--edit', 'Open configuration in editor')
    .option('--env [environment]', 'Show or set current environment')
    .option('--list-envs', 'List available environments')
    .action(async (options) => {
      await cli.executeConfig(options, program.opts());
    });

  // Maintenance command
  program
    .command('maintenance')
    .description('System maintenance operations')
    .option('--cleanup', 'Clean up old logs and temporary files')
    .option('--backup', 'Create system backup')
    .option('--restore <file>', 'Restore from backup')
    .option('--db-migrate', 'Run database migrations')
    .option('--db-seed', 'Seed database with sample data')
    .action(async (options) => {
      await cli.executeMaintenance(options, program.opts());
    });

  // Status command
  program
    .command('status')
    .description('Show overall system status')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      await cli.executeStatus(options, program.opts());
    });


  // Error handling
  program.exitOverride();


  try {
    // Start monitoring service
    await monitoring.start();

    // Parse and execute commands
    await program.parseAsync(process.argv);

    // Commands completed successfully, now shutdown
    try {
      await monitoring.shutdown();
    } catch (shutdownError) {
      console.error('Warning: Error during shutdown:', shutdownError.message);
    }

  } catch (error) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
      process.exit(0);
    }

    logger.error('CLI execution failed', {
      error: error.message,
      code: error.code,
      stack: error.stack
    });

    console.error(`Error: ${error.message}`);

    // Shutdown on error too
    try {
      await monitoring.shutdown();
    } catch (shutdownError) {
      console.error('Warning: Error during shutdown:', shutdownError.message);
    }

    process.exit(1);
  }
}

// Handle uncaught exceptions
// Removed duplicate event listeners to prevent MaxListenersExceededWarning
// These are now handled centrally in server.js
/*
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
*/

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  try {
    const monitoring = MonitoringService.getMonitoringService();
    await monitoring.shutdown();
  } catch (error) {
    console.error('Error during shutdown:', error.message);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  try {
    const monitoring = MonitoringService.getMonitoringService();
    await monitoring.shutdown();
  } catch (error) {
    console.error('Error during shutdown:', error.message);
  }
  process.exit(0);
});

// Run the CLI
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

// module.exports = { main };

main();