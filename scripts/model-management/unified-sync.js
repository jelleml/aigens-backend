#!/usr/bin/env node

/**
 * Unified Model Management CLI
 * 
 * Command-line interface for the UnifiedModelManager
 * Supports all execution modes with comprehensive options
 */

const { UnifiedModelManager, EXECUTION_MODES, EXECUTION_STRATEGIES } = require('../../services/model-management/unified-model-manager');
const { createLogger } = require('../utils/error-handler');

/**
 * CLI configuration and help text
 */
const CLI_CONFIG = {
  name: 'unified-sync',
  version: '1.0.0',
  description: 'Unified AI Model Management System'
};

const HELP_TEXT = `
${CLI_CONFIG.description} v${CLI_CONFIG.version}

USAGE:
  node ${CLI_CONFIG.name}.js [mode] [options]

MODES:
  init     Initialize all models from scratch
  update   Update existing models and add new ones (default)
  sync     Full synchronization with cleanup of stale models

OPTIONS:
  --providers <list>     Comma-separated list of providers (e.g., openai,anthropic)
  --strategy <strategy>  Execution strategy: sequential, parallel, mixed (default: mixed)
  --concurrency <num>    Max concurrent providers (default: 3)
  --timeout <ms>         Provider timeout in milliseconds (default: 300000)
  --batch-size <num>     Batch size for model processing (default: 50)
  --dry-run             Simulate execution without database changes
  --force               Force execution even with unhealthy providers
  --skip-health-check   Skip initial health check
  --log-level <level>   Log level: debug, info, warn, error (default: info)
  --help, -h            Show this help message
  --version, -v         Show version information

EXAMPLES:
  # Update all providers with default settings
  node ${CLI_CONFIG.name}.js update

  # Initialize only OpenAI and Anthropic providers
  node ${CLI_CONFIG.name}.js init --providers openai,anthropic

  # Dry-run synchronization with debug logging
  node ${CLI_CONFIG.name}.js sync --dry-run --log-level debug

  # Parallel execution with high concurrency
  node ${CLI_CONFIG.name}.js update --strategy parallel --concurrency 5

  # Force execution even if providers are unhealthy
  node ${CLI_CONFIG.name}.js sync --force --skip-health-check

PROVIDER NAMES:
  openai, anthropic, deepseek, ideogram, together, openrouter

For more information, visit the project documentation.
`;

/**
 * Parse command line arguments
 * @param {Array} args - Command line arguments
 * @returns {Object} Parsed options
 */
function parseArgs(args) {
  const options = {
    mode: EXECUTION_MODES.UPDATE, // default mode
    providers: [],
    strategy: EXECUTION_STRATEGIES.MIXED,
    concurrency: 3,
    timeout: 300000,
    batchSize: 50,
    dryRun: false,
    force: false,
    skipHealthCheck: false,
    logLevel: 'info',
    help: false,
    version: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;

      case '--version':
      case '-v':
        options.version = true;
        break;

      case '--providers':
        if (nextArg && !nextArg.startsWith('--')) {
          options.providers = nextArg.split(',').map(p => p.trim());
          i++;
        }
        break;

      case '--strategy':
        if (nextArg && Object.values(EXECUTION_STRATEGIES).includes(nextArg)) {
          options.strategy = nextArg;
          i++;
        } else {
          throw new Error(`Invalid strategy: ${nextArg}. Valid strategies: ${Object.values(EXECUTION_STRATEGIES).join(', ')}`);
        }
        break;

      case '--concurrency':
        if (nextArg && !isNaN(nextArg)) {
          options.concurrency = parseInt(nextArg, 10);
          i++;
        }
        break;

      case '--timeout':
        if (nextArg && !isNaN(nextArg)) {
          options.timeout = parseInt(nextArg, 10);
          i++;
        }
        break;

      case '--batch-size':
        if (nextArg && !isNaN(nextArg)) {
          options.batchSize = parseInt(nextArg, 10);
          i++;
        }
        break;

      case '--log-level':
        if (nextArg && ['debug', 'info', 'warn', 'error'].includes(nextArg)) {
          options.logLevel = nextArg;
          i++;
        }
        break;

      case '--dry-run':
        options.dryRun = true;
        break;

      case '--force':
        options.force = true;
        break;

      case '--skip-health-check':
        options.skipHealthCheck = true;
        break;

      default:
        // Check if it's a mode
        if (Object.values(EXECUTION_MODES).includes(arg)) {
          options.mode = arg;
        } else if (!arg.startsWith('--')) {
          // Unknown positional argument
          console.warn(`Warning: Unknown argument ignored: ${arg}`);
        }
        break;
    }
  }

  return options;
}

/**
 * Validate parsed options
 * @param {Object} options - Parsed options
 */
function validateOptions(options) {
  if (options.concurrency < 1 || options.concurrency > 10) {
    throw new Error('Concurrency must be between 1 and 10');
  }

  if (options.timeout < 10000 || options.timeout > 1800000) {
    throw new Error('Timeout must be between 10 seconds and 30 minutes');
  }

  if (options.batchSize < 1 || options.batchSize > 1000) {
    throw new Error('Batch size must be between 1 and 1000');
  }

  // Validate provider names
  const validProviders = ['openai', 'anthropic', 'deepseek', 'ideogram', 'together', 'openrouter'];
  for (const provider of options.providers) {
    if (!validProviders.includes(provider)) {
      throw new Error(`Invalid provider: ${provider}. Valid providers: ${validProviders.join(', ')}`);
    }
  }
}

/**
 * Create progress reporter
 * @param {string} mode - Execution mode
 * @returns {Object} Progress reporter
 */
function createProgressReporter(mode) {
  let startTime = Date.now();
  let lastUpdate = startTime;

  return {
    start: (totalProviders) => {
      startTime = Date.now();
      lastUpdate = startTime;
      console.log(`\n🚀 Starting ${mode} execution for ${totalProviders} providers...\n`);
    },

    providerStart: (providerName) => {
      console.log(`⏳ Processing ${providerName}...`);
    },

    providerComplete: (providerName, result) => {
      const duration = Math.round((Date.now() - lastUpdate) / 1000);
      lastUpdate = Date.now();

      if (result.success) {
        const stats = [];
        if (result.modelsProcessed) stats.push(`${result.modelsProcessed} processed`);
        if (result.modelsCreated) stats.push(`${result.modelsCreated} created`);
        if (result.modelsUpdated) stats.push(`${result.modelsUpdated} updated`);
        if (result.modelsRemoved) stats.push(`${result.modelsRemoved} removed`);

        console.log(`✅ ${providerName} completed in ${duration}s (${stats.join(', ') || 'no changes'})`);
      } else {
        console.log(`❌ ${providerName} failed in ${duration}s: ${result.error}`);
      }
    },

    complete: (summary) => {
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      
      console.log('\n📊 EXECUTION SUMMARY');
      console.log('==================');
      console.log(`⏱️  Duration: ${totalDuration}s`);
      console.log(`✅ Successful providers: ${summary.successfulProviders}/${summary.totalProviders}`);
      console.log(`❌ Failed providers: ${summary.failedProviders}/${summary.totalProviders}`);
      console.log(`📋 Total models processed: ${summary.totalModelsProcessed}`);
      console.log(`➕ Total models created: ${summary.totalModelsCreated}`);
      console.log(`🔄 Total models updated: ${summary.totalModelsUpdated}`);

      if (summary.totalModelsRemoved) {
        console.log(`🗑️  Total models removed: ${summary.totalModelsRemoved}`);
      }

      console.log('\n📋 PROVIDER DETAILS:');
      for (const [provider, result] of Object.entries(summary.providers)) {
        const status = result.success ? '✅' : '❌';
        const duration = Math.round(result.duration / 1000);
        const stats = [];
        
        if (result.modelsProcessed) stats.push(`${result.modelsProcessed}p`);
        if (result.modelsCreated) stats.push(`${result.modelsCreated}c`);
        if (result.modelsUpdated) stats.push(`${result.modelsUpdated}u`);
        if (result.modelsRemoved) stats.push(`${result.modelsRemoved}r`);

        console.log(`  ${status} ${provider}: ${duration}s (${stats.join(', ') || 'no changes'})`);
        
        if (!result.success && result.error) {
          console.log(`      Error: ${result.error}`);
        }
      }

      if (summary.failedProviders === 0) {
        console.log('\n🎉 All providers processed successfully!');
      } else {
        console.log(`\n⚠️  ${summary.failedProviders} provider(s) failed. Check logs for details.`);
      }
    }
  };
}

/**
 * Main execution function
 * @param {Object} options - Parsed CLI options
 */
async function main(options) {
  // Create logger
  const logger = createLogger('unified-sync', {
    logLevel: options.logLevel
  });

  // Create progress reporter
  const progress = createProgressReporter(options.mode);

  // Initialize manager
  const manager = new UnifiedModelManager({
    config: {
      strategy: options.strategy,
      maxConcurrency: options.concurrency,
      providerTimeout: options.timeout,
      batchSize: options.batchSize,
      logLevel: options.logLevel
    },
    logger,
    dryRun: options.dryRun
  });

  try {
    // Initialize
    logger.info('Initializing UnifiedModelManager...');
    await manager.initialize();

    // Show status
    const status = manager.getStatus();
    logger.info('Manager Status', {
      totalProviders: status.totalProviders,
      healthyProviders: status.healthyProviders,
      dryRun: status.dryRun
    });

    if (options.dryRun) {
      console.log('\n🧪 DRY RUN MODE - No database changes will be made\n');
    }

    // Start execution
    progress.start(status.totalProviders);

    const result = await manager.execute(options.mode, {
      providers: options.providers,
      force: options.force,
      skipHealthCheck: options.skipHealthCheck,
      strategy: options.strategy,
      maxConcurrency: options.concurrency
    });

    // Show results
    progress.complete(result.summary);

    // Final status
    if (result.summary.failedProviders === 0) {
      process.exit(0);
    } else {
      process.exit(1);
    }

  } catch (error) {
    logger.error('Execution failed', error);
    console.error(`\n❌ Execution failed: ${error.message}`);
    process.exit(1);
  } finally {
    // Cleanup
    try {
      await manager.cleanup();
    } catch (cleanupError) {
      logger.error('Cleanup failed', cleanupError);
    }
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    // Handle help and version
    if (options.help) {
      console.log(HELP_TEXT);
      process.exit(0);
    }

    if (options.version) {
      console.log(`${CLI_CONFIG.name} v${CLI_CONFIG.version}`);
      process.exit(0);
    }

    // Validate options
    validateOptions(options);

    // Show startup info
    console.log(`${CLI_CONFIG.description} v${CLI_CONFIG.version}`);
    console.log(`Mode: ${options.mode}`);
    console.log(`Strategy: ${options.strategy}`);
    if (options.providers.length > 0) {
      console.log(`Providers: ${options.providers.join(', ')}`);
    }
    if (options.dryRun) {
      console.log('🧪 Dry Run Mode Enabled');
    }

    // Run main function
    main(options).catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.log('\nUse --help for usage information.');
    process.exit(1);
  }
}

module.exports = { parseArgs, validateOptions, CLI_CONFIG };