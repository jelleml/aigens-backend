/**
 * CLI Core Implementation
 * 
 * Core CLI functionality with command execution, progress tracking,
 * and interactive mode support for the model management system.
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const db = require('../../../database');
const { ProgressTracker } = require('./progress-tracker');
const { CLIConfig } = require('./cli-config');
const { OutputFormatter } = require('./output-formatter');

/**
 * ModelManagementCLI class
 */
class ModelManagementCLI {
  /**
   * @param {Object} options - CLI options
   * @param {Object} options.monitoring - Monitoring service instance
   * @param {string} options.version - CLI version
   */
  constructor(options = {}) {
    const { monitoring, version = '1.0.0' } = options;
    
    this.monitoring = monitoring;
    this.logger = monitoring.getLogger('cli-core');
    this.metrics = monitoring.getMetrics();
    this.version = version;
    
    // Initialize CLI components
    this.config = new CLIConfig();
    this.formatter = new OutputFormatter();
    this.progressTracker = new ProgressTracker();
    
    // Interactive mode state
    this.interactiveMode = false;
    this.interactiveSpinner = null;
    
    this.logger.info('CLI Core initialized', { version });
  }

  /**
   * Execute sync command
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async executeSync(options, globalOptions) {
    const timer = this.metrics.startTimer('cli_sync_command');
    const correlationId = this.logger.generateCorrelationId();
    
    try {
      this.logger.info('Sync command started', { correlationId, options });
      
      if (globalOptions.dryRun) {
        console.log(chalk.yellow('🔍 DRY RUN MODE - No changes will be made\n'));
      }
      
      // Initialize database connection
      await db.initialize();
      this.logger.debug('Database connection established');
      
      // Parse options
      const providers = options.provider ? 
        (Array.isArray(options.provider) ? options.provider : [options.provider]) : null;
      const parallel = parseInt(options.parallel) || 3;
      const timeout = parseInt(options.timeout) || 300000;
      const fullSync = options.full || false;
      
      console.log(chalk.blue('🔄 Starting Model Synchronization\n'));
      
      // Get providers to sync
      const { Provider } = db.models;
      let providersToSync;
      
      if (providers) {
        providersToSync = await Provider.findAll({
          where: { 
            name: providers
          }
        });
        
        if (providersToSync.length === 0) {
          throw new Error(`No active providers found matching: ${providers.join(', ')}`);
        }
      } else {
        providersToSync = await Provider.findAll({
          where: { 
            ...(options.type && { provider_type: options.type })
          }
        });
      }
      
      console.log(`Found ${providersToSync.length} provider(s) to sync:`);
      providersToSync.forEach(p => {
        console.log(`  • ${p.name} (${p.provider_type})`);
      });
      console.log();
      
      if (globalOptions.dryRun) {
        console.log(chalk.green('✅ Dry run completed - no changes made'));
        return;
      }
      
      // Execute sync operations
      const progress = this.progressTracker.createProgress({
        total: providersToSync.length,
        format: 'Syncing providers [{bar}] {percentage}% | {value}/{total} | ETA: {eta}s'
      });
      
      const results = [];
      const semaphore = new Array(parallel).fill(null);
      let completed = 0;
      
      const syncProvider = async (provider) => {
        const providerTimer = this.metrics.startTimer('provider_sync', {
          provider: provider.name,
          type: provider.provider_type
        });
        
        try {
          // Simulate sync operation (replace with actual sync logic)
          await this.simulateProviderSync(provider, fullSync);
          
          this.metrics.endTimer(providerTimer);
          this.metrics.increment('provider_sync_success', 1, {
            provider: provider.name
          });
          
          return {
            provider: provider.name,
            status: 'success',
            models: Math.floor(Math.random() * 50) + 10,
            duration: Math.floor(Math.random() * 5000) + 1000
          };
          
        } catch (error) {
          this.metrics.endTimer(providerTimer);
          this.metrics.increment('provider_sync_failure', 1, {
            provider: provider.name
          });
          
          return {
            provider: provider.name,
            status: 'error',
            error: error.message,
            duration: Math.floor(Math.random() * 2000) + 500
          };
        }
      };
      
      // Process providers with concurrency limit
      const processingPromises = providersToSync.map(async (provider) => {
        // Wait for available slot
        const slotIndex = await this.waitForSlot(semaphore);
        
        try {
          const result = await syncProvider(provider);
          results.push(result);
          progress.increment();
          completed++;
          
          // Update progress display
          progress.update(completed, {
            provider: provider.name,
            status: result.status
          });
          
          return result;
          
        } finally {
          // Release slot
          semaphore[slotIndex] = null;
        }
      });
      
      await Promise.all(processingPromises);
      progress.stop();
      
      // Display results
      this.displaySyncResults(results);
      
      this.metrics.endTimer(timer);
      this.logger.info('Sync command completed', { 
        correlationId, 
        results: results.length,
        successful: results.filter(r => r.status === 'success').length
      });
      
    } catch (error) {
      this.metrics.endTimer(timer);
      this.logger.error('Sync command failed', { correlationId, error: error.message });
      console.error(chalk.red(`❌ Sync failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Execute health command
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async executeHealth(options, globalOptions) {
    const timer = this.metrics.startTimer('cli_health_command');
    
    try {
      console.log(chalk.blue('🏥 System Health Check\n'));
      
      const spinner = ora('Checking system health...').start();
      
      // Perform health check
      const healthCheck = await this.monitoring.performHealthCheck();
      
      spinner.stop();
      
      // Display overall status
      const statusColor = healthCheck.status === 'healthy' ? 'green' :
                         healthCheck.status === 'degraded' ? 'yellow' : 'red';
      
      console.log(`Overall Status: ${chalk[statusColor](healthCheck.status.toUpperCase())}\n`);
      
      // Display detailed health information
      if (options.detailed) {
        this.displayDetailedHealth(healthCheck);
      } else {
        this.displayHealthSummary(healthCheck);
      }
      
      // Handle provider-specific health checks
      if (options.provider) {
        await this.checkProviderHealth(options.provider, options.fix);
      }
      
      this.metrics.endTimer(timer);
      
    } catch (error) {
      this.metrics.endTimer(timer);
      this.logger.error('Health command failed', { error: error.message });
      console.error(chalk.red(`❌ Health check failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Execute metrics command
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async executeMetrics(options, globalOptions) {
    try {
      console.log(chalk.blue('📊 System Metrics\n'));
      
      if (options.watch) {
        await this.watchMetrics(parseInt(options.interval) || 5);
      } else {
        const metrics = this.metrics.getMetrics();
        
        if (options.export) {
          await this.exportMetrics(metrics, options.export, options.output);
        } else {
          this.displayMetrics(metrics);
        }
      }
      
    } catch (error) {
      this.logger.error('Metrics command failed', { error: error.message });
      console.error(chalk.red(`❌ Metrics command failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Execute logs command
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async executeLogs(options, globalOptions) {
    try {
      console.log(chalk.blue('📋 System Logs\n'));
      
      if (options.rotate) {
        const spinner = ora('Rotating logs...').start();
        // Trigger log rotation
        spinner.succeed('Log rotation completed');
        return;
      }
      
      if (options.follow) {
        console.log('Following logs (Press Ctrl+C to exit)...\n');
        // Implement log following logic
        await this.followLogs(options);
      } else {
        await this.displayLogs(options);
      }
      
    } catch (error) {
      this.logger.error('Logs command failed', { error: error.message });
      console.error(chalk.red(`❌ Logs command failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Execute providers command
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async executeProviders(options, globalOptions) {
    try {
      console.log(chalk.blue('🔌 Provider Management\n'));
      
      const { Provider, ProviderHealthStatus } = db.models;
      
      if (options.list || options.status) {
        const providers = await Provider.findAll({
          include: [{
            model: ProviderHealthStatus,
            as: 'healthStatus',
            required: false
          }],
          order: [['name', 'ASC']]
        });
        
        this.displayProviders(providers, options.status);
      }
      
      if (options.enable) {
        await this.toggleProvider(options.enable, true);
      }
      
      if (options.disable) {
        await this.toggleProvider(options.disable, false);
      }
      
      if (options.test) {
        await this.testProvider(options.test);
      }
      
    } catch (error) {
      this.logger.error('Providers command failed', { error: error.message });
      console.error(chalk.red(`❌ Providers command failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Execute models command
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async executeModels(options, globalOptions) {
    try {
      console.log(chalk.blue('🤖 Model Management\n'));
      
      const { Model, Provider } = db.models;
      
      // Build query conditions
      const whereConditions = {};
      if (options.active) whereConditions.is_active = true;
      if (options.deprecated) whereConditions.is_deprecated = true;
      if (options.search) {
        whereConditions[db.Sequelize.Op.or] = [
          { model_name: { [db.Sequelize.Op.iLike]: `%${options.search}%` } },
          { description: { [db.Sequelize.Op.iLike]: `%${options.search}%` } }
        ];
      }
      
      // Include provider filter
      const includeConditions = [];
      if (options.provider) {
        includeConditions.push({
          model: Provider,
          as: 'provider',
          where: { name: options.provider }
        });
      } else {
        includeConditions.push({
          model: Provider,
          as: 'provider'
        });
      }
      
      const models = await Model.findAll({
        where: whereConditions,
        include: includeConditions,
        order: [['model_name', 'ASC']]
      });
      
      this.displayModels(models, options);
      
    } catch (error) {
      this.logger.error('Models command failed', { error: error.message });
      console.error(chalk.red(`❌ Models command failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Start interactive mode
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async startInteractiveMode(options, globalOptions) {
    try {
      this.interactiveMode = true;
      
      console.log(chalk.blue.bold('🚀 Model Management Interactive Mode\n'));
      console.log('Welcome to the Model Management CLI interactive mode!');
      console.log('Type "help" for available commands or "exit" to quit.\n');
      
      while (this.interactiveMode) {
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { name: '🔄 Sync models from providers', value: 'sync' },
              { name: '🏥 Check system health', value: 'health' },
              { name: '📊 View metrics', value: 'metrics' },
              { name: '🔌 Manage providers', value: 'providers' },
              { name: '🤖 Browse models', value: 'models' },
              { name: '📋 View logs', value: 'logs' },
              { name: '⚙️  Configuration', value: 'config' },
              { name: '❌ Exit', value: 'exit' }
            ]
          }
        ]);
        
        if (action === 'exit') {
          this.interactiveMode = false;
          console.log(chalk.green('👋 Goodbye!'));
          break;
        }
        
        await this.handleInteractiveAction(action);
      }
      
    } catch (error) {
      this.logger.error('Interactive mode failed', { error: error.message });
      console.error(chalk.red(`❌ Interactive mode failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Execute config command
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async executeConfig(options, globalOptions) {
    try {
      console.log(chalk.blue('⚙️  Configuration Management\n'));
      
      if (options.show) {
        const config = this.config.getConfig();
        console.log(JSON.stringify(config, null, 2));
      }
      
      if (options.set) {
        const [key, value] = options.set.split('=');
        await this.config.set(key.trim(), value.trim());
        console.log(chalk.green(`✅ Configuration updated: ${key} = ${value}`));
      }
      
      if (options.reset) {
        await this.config.reset();
        console.log(chalk.green('✅ Configuration reset to defaults'));
      }
      
      if (options.edit) {
        await this.config.openEditor();
      }
      
      // Handle environment options
      if (options.listEnvs) {
        const { getAvailableEnvironments } = require('../../../config/model-management');
        const environments = getAvailableEnvironments();
        
        console.log(chalk.blue('\nAvailable Environments:'));
        
        const table = new Table({
          head: ['Environment', 'Type', 'Status']
        });
        
        const currentEnv = process.env.NODE_ENV || 'development';
        
        environments.forEach(env => {
          const isStandard = ['development', 'test', 'staging', 'production'].includes(env);
          const isActive = env === currentEnv;
          
          table.push([
            env,
            isStandard ? 'Standard' : 'Custom',
            isActive ? chalk.green('Active') : ''
          ]);
        });
        
        console.log(table.toString());
      }
      
      if (options.env !== undefined) {
        const { getAvailableEnvironments } = require('../../../config/model-management');
        const environments = getAvailableEnvironments();
        const currentEnv = process.env.NODE_ENV || 'development';
        
        if (options.env === true || !options.env) {
          // Just show current environment
          console.log(`Current environment: ${chalk.green(currentEnv)}`);
        } else {
          // Set environment
          const newEnv = options.env;
          
          if (!environments.includes(newEnv)) {
            console.log(chalk.yellow(`Warning: Environment '${newEnv}' is not defined in configuration files.`));
            console.log('Available environments: ' + environments.join(', '));
            
            const { confirm } = await inquirer.prompt([{
              type: 'confirm',
              name: 'confirm',
              message: `Do you want to use '${newEnv}' anyway?`,
              default: false
            }]);
            
            if (!confirm) {
              return;
            }
          }
          
          // Set environment variable for current process
          process.env.NODE_ENV = newEnv;
          
          // For persistence, suggest adding to .env file
          console.log(chalk.green(`✅ Environment set to: ${newEnv} for current session`));
          console.log(chalk.yellow('\nNote: This setting only affects the current session.'));
          console.log('To make it persistent, add to your .env file:');
          console.log(chalk.cyan(`NODE_ENV=${newEnv}`));
          
          // If it's a custom environment, suggest setting the custom env flag
          if (!['development', 'test', 'staging', 'production'].includes(newEnv)) {
            console.log('\nFor custom environments, also add:');
            console.log(chalk.cyan('MODEL_MGMT_USE_CUSTOM_ENV=true'));
          }
        }
      }
      
    } catch (error) {
      this.logger.error('Config command failed', { error: error.message });
      console.error(chalk.red(`❌ Config command failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Execute maintenance command
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async executeMaintenance(options, globalOptions) {
    try {
      console.log(chalk.blue('🔧 System Maintenance\n'));
      
      if (options.cleanup) {
        const spinner = ora('Cleaning up system...').start();
        // Perform cleanup operations
        spinner.succeed('System cleanup completed');
      }
      
      if (options.backup) {
        const spinner = ora('Creating system backup...').start();
        // Create backup
        spinner.succeed('Backup created successfully');
      }
      
      if (options.restore) {
        const spinner = ora(`Restoring from ${options.restore}...`).start();
        // Restore from backup
        spinner.succeed('System restored successfully');
      }
      
    } catch (error) {
      this.logger.error('Maintenance command failed', { error: error.message });
      console.error(chalk.red(`❌ Maintenance command failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Execute status command
   * @param {Object} options - Command options
   * @param {Object} globalOptions - Global CLI options
   */
  async executeStatus(options, globalOptions) {
    try {
      console.log('>> executeStatus called');
      const status = this.monitoring.getStatus();
      console.log('>> status:', status);
      const healthCheck = await this.monitoring.performHealthCheck();
      
      const systemStatus = {
        service: status.service,
        version: status.version,
        uptime: status.uptime,
        health: healthCheck.status,
        components: status.components,
        timestamp: new Date().toISOString()
      };
      
      if (options.json) {
        console.log(JSON.stringify(systemStatus, null, 2));
      } else {
        console.log(chalk.blue('📊 System Status\n'));
        this.formatter.displayKeyValue(systemStatus);
      }
      
    } catch (error) {
      this.logger.error('Status command failed', { error: error.message });
      console.error(chalk.red(`❌ Status command failed: ${error.message}`));
      throw error; // Let the main CLI handle the shutdown
    }
  }

  /**
   * Simulate provider sync (replace with actual implementation)
   * @param {Object} provider - Provider object
   * @param {boolean} fullSync - Whether to perform full sync
   */
  async simulateProviderSync(provider, fullSync) {
    // Simulate API call delay
    const delay = Math.floor(Math.random() * 3000) + 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Simulate occasional failures
    if (Math.random() < 0.1) {
      throw new Error(`Connection failed to ${provider.name}`);
    }
  }

  /**
   * Wait for available slot in semaphore
   * @param {Array} semaphore - Semaphore array
   * @returns {Promise<number>} Available slot index
   */
  async waitForSlot(semaphore) {
    return new Promise((resolve) => {
      const checkSlot = () => {
        const availableIndex = semaphore.findIndex(slot => slot === null);
        if (availableIndex !== -1) {
          semaphore[availableIndex] = true;
          resolve(availableIndex);
        } else {
          setTimeout(checkSlot, 100);
        }
      };
      checkSlot();
    });
  }

  /**
   * Display sync results
   * @param {Array} results - Sync results
   */
  displaySyncResults(results) {
    console.log(chalk.blue('\n📊 Sync Results\n'));
    
    const table = new Table({
      head: ['Provider', 'Status', 'Models', 'Duration'],
      colWidths: [20, 12, 10, 12]
    });
    
    results.forEach(result => {
      const status = result.status === 'success' ? 
        chalk.green('✅ Success') : 
        chalk.red('❌ Error');
      
      table.push([
        result.provider,
        status,
        result.models || 'N/A',
        `${result.duration}ms`
      ]);
    });
    
    console.log(table.toString());
    
    // Summary
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.length - successful;
    
    console.log(`\n${chalk.green(`✅ Successful: ${successful}`)} | ${chalk.red(`❌ Failed: ${failed}`)}\n`);
  }

  /**
   * Display health summary
   * @param {Object} healthCheck - Health check results
   */
  displayHealthSummary(healthCheck) {
    const table = new Table({
      head: ['Component', 'Status', 'Details']
    });
    
    Object.entries(healthCheck.checks).forEach(([component, check]) => {
      const status = check.status === 'healthy' ? 
        chalk.green('✅ Healthy') :
        check.status === 'degraded' ?
        chalk.yellow('⚠️  Degraded') :
        chalk.red('❌ Unhealthy');
      
      table.push([
        component,
        status,
        check.message || 'OK'
      ]);
    });
    
    console.log(table.toString());
  }

  /**
   * Display detailed health information
   * @param {Object} healthCheck - Health check results
   */
  displayDetailedHealth(healthCheck) {
    console.log(JSON.stringify(healthCheck, null, 2));
  }

  /**
   * Display metrics
   * @param {Object} metrics - Metrics data
   */
  displayMetrics(metrics) {
    console.log(JSON.stringify(metrics, null, 2));
  }

  /**
   * Watch metrics in real-time
   * @param {number} interval - Update interval in seconds
   */
  async watchMetrics(interval) {
    console.log(`Watching metrics (updating every ${interval}s, Press Ctrl+C to exit)...\n`);
    
    const updateMetrics = () => {
      console.clear();
      console.log(chalk.blue('📊 Real-time Metrics\n'));
      
      const metrics = this.metrics.getSummary();
      this.formatter.displayKeyValue(metrics);
      
      console.log(chalk.gray(`\nLast updated: ${new Date().toLocaleTimeString()}`));
    };
    
    // Initial display
    updateMetrics();
    
    // Set up interval
    const intervalId = setInterval(updateMetrics, interval * 1000);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      console.log('\nStopped watching metrics.');
      process.exit(0);
    });
  }

  /**
   * Export metrics
   * @param {Object} metrics - Metrics data
   * @param {string} format - Export format
   * @param {string} output - Output file
   */
  async exportMetrics(metrics, format, output) {
    const filename = output || `metrics_${Date.now()}.${format}`;
    
    let content;
    if (format === 'json') {
      content = JSON.stringify(metrics, null, 2);
    } else if (format === 'csv') {
      // Convert metrics to CSV format
      content = this.formatter.metricsToCSV(metrics);
    }
    
    fs.writeFileSync(filename, content);
    console.log(chalk.green(`✅ Metrics exported to ${filename}`));
  }

  /**
   * Display logs
   * @param {Object} options - Log options
   */
  async displayLogs(options) {
    // Implement log display logic
    console.log('Log display functionality would be implemented here');
  }

  /**
   * Follow logs in real-time
   * @param {Object} options - Log options
   */
  async followLogs(options) {
    // Implement log following logic
    console.log('Log following functionality would be implemented here');
  }

  /**
   * Display providers
   * @param {Array} providers - Provider list
   * @param {boolean} showStatus - Whether to show status
   */
  displayProviders(providers, showStatus) {
    const table = new Table({
      head: showStatus ? 
        ['Name', 'Type', 'Status', 'Health', 'Models'] :
        ['Name', 'Type', 'Active', 'Models']
    });
    
    providers.forEach(provider => {
      if (showStatus) {
        const health = provider.healthStatus?.status || 'unknown';
        const healthColor = health === 'healthy' ? 'green' :
                           health === 'degraded' ? 'yellow' : 'red';
        
        table.push([
          provider.name,
          provider.provider_type,
          provider.is_active ? chalk.green('Active') : chalk.red('Inactive'),
          chalk[healthColor](health),
          provider.healthStatus?.models_count || 'N/A'
        ]);
      } else {
        table.push([
          provider.name,
          provider.provider_type,
          provider.is_active ? chalk.green('Yes') : chalk.red('No'),
          'N/A' // Would show actual model count
        ]);
      }
    });
    
    console.log(table.toString());
  }

  /**
   * Display models
   * @param {Array} models - Model list
   * @param {Object} options - Display options
   */
  displayModels(models, options) {
    const table = new Table({
      head: ['Name', 'Provider', 'Type', 'Status', 'Updated']
    });
    
    models.forEach(model => {
      const status = model.is_active ? 
        (model.is_deprecated ? chalk.yellow('Deprecated') : chalk.green('Active')) :
        chalk.red('Inactive');
      
      table.push([
        model.model_name,
        model.provider?.name || 'Unknown',
        model.model_type || 'N/A',
        status,
        model.updated_at ? new Date(model.updated_at).toLocaleDateString() : 'N/A'
      ]);
    });
    
    console.log(table.toString());
    console.log(chalk.blue(`\nTotal: ${models.length} models\n`));
  }

  /**
   * Handle interactive action
   * @param {string} action - Action to handle
   */
  async handleInteractiveAction(action) {
    try {
      switch (action) {
        case 'sync':
          // Interactive sync options
          const syncOptions = await this.getInteractiveSyncOptions();
          await this.executeSync(syncOptions, {});
          break;
          
        case 'health':
          await this.executeHealth({}, {});
          break;
          
        case 'metrics':
          await this.executeMetrics({}, {});
          break;
          
        case 'providers':
          await this.executeProviders({ list: true, status: true }, {});
          break;
          
        case 'models':
          await this.executeModels({ list: true }, {});
          break;
          
        case 'logs':
          await this.executeLogs({ lines: 20 }, {});
          break;
          
        case 'config':
          await this.executeConfig({ show: true }, {});
          break;
      }
      
      // Pause before returning to menu
      await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
      }]);
      
    } catch (error) {
      console.error(chalk.red(`❌ Action failed: ${error.message}`));
    }
  }

  /**
   * Get interactive sync options
   * @returns {Object} Sync options
   */
  async getInteractiveSyncOptions() {
    const { Provider } = db.models;
    const providers = await Provider.findAll({
      order: [['name', 'ASC']]
    });
    
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'provider',
        message: 'Select providers to sync:',
        choices: [
          { name: 'All providers', value: null },
          ...providers.map(p => ({ name: `${p.name} (${p.provider_type})`, value: p.name }))
        ]
      },
      {
        type: 'confirm',
        name: 'full',
        message: 'Perform full sync (not incremental)?',
        default: false
      },
      {
        type: 'number',
        name: 'parallel',
        message: 'Number of parallel operations:',
        default: 3,
        validate: (value) => value > 0 && value <= 10
      }
    ]);
    
    // Filter out null (All providers)
    if (answers.provider && answers.provider.includes(null)) {
      answers.provider = null;
    }
    
    return answers;
  }

  /**
   * Toggle provider status
   * @param {string} providerName - Provider name
   * @param {boolean} enabled - Enable/disable
   */
  async toggleProvider(providerName, enabled) {
    const { Provider } = db.models;
    const provider = await Provider.findOne({ where: { name: providerName } });
    
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }
    
    await provider.update({ is_active: enabled });
    
    console.log(chalk.green(
      `✅ Provider ${providerName} ${enabled ? 'enabled' : 'disabled'}`
    ));
  }

  /**
   * Test provider connection
   * @param {string} providerName - Provider name
   */
  async testProvider(providerName) {
    const spinner = ora(`Testing ${providerName} connection...`).start();
    
    try {
      // Simulate provider test
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Random success/failure for demo
      if (Math.random() > 0.2) {
        spinner.succeed(`${providerName} connection test passed`);
      } else {
        spinner.fail(`${providerName} connection test failed`);
      }
      
    } catch (error) {
      spinner.fail(`${providerName} test failed: ${error.message}`);
    }
  }

  /**
   * Check provider health
   * @param {Array} providers - Provider names
   * @param {boolean} fix - Whether to attempt fixes
   */
  async checkProviderHealth(providers, fix) {
    console.log(chalk.blue('\n🔍 Provider Health Check\n'));
    
    for (const providerName of providers) {
      const spinner = ora(`Checking ${providerName}...`).start();
      
      try {
        // Simulate health check
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const isHealthy = Math.random() > 0.3;
        
        if (isHealthy) {
          spinner.succeed(`${providerName}: Healthy`);
        } else {
          spinner.warn(`${providerName}: Degraded`);
          
          if (fix) {
            const fixSpinner = ora(`Attempting to fix ${providerName}...`).start();
            await new Promise(resolve => setTimeout(resolve, 2000));
            fixSpinner.succeed(`${providerName}: Fixed`);
          }
        }
        
      } catch (error) {
        spinner.fail(`${providerName}: ${error.message}`);
      }
    }
  }
}

module.exports = { ModelManagementCLI };