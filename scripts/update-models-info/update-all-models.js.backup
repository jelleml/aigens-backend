#!/usr/bin/env node

/**
 * Unified Models Update Script
 * 
 * This script orchestrates the execution of all provider-specific model update scripts.
 * It supports running all providers by default or individual providers via command line parameters.
 * 
 * Features:
 * - Run all provider update scripts by default
 * - Support for individual provider execution via parameters
 * - Comprehensive logging and error handling
 * - Summary reporting across all executed scripts
 * - Graceful error handling and rollback support
 * 
 * Usage:
 *   node scripts/update-models-info/update-all-models.js                    # Run all providers
 *   node scripts/update-models-info/update-all-models.js --anthropic        # Run only Anthropic
 *   node scripts/update-models-info/update-all-models.js --openai           # Run only OpenAI  
 *   node scripts/update-models-info/update-all-models.js --ideogram         # Run only Ideogram
 *   node scripts/update-models-info/update-all-models.js --openrouter       # Run only OpenRouter
 *   node scripts/update-models-info/update-all-models.js --together         # Run only Together AI
 *   node scripts/update-models-info/update-all-models.js --veo3             # Run only Google Veo3
 *   node scripts/update-models-info/update-all-models.js --runway           # Run only Runway
 *   node scripts/update-models-info/update-all-models.js --nova             # Run only Amazon Nova
 *   node scripts/update-models-info/update-all-models.js --anthropic --openai  # Run multiple providers
 */

const { spawn } = require('child_process');
const path = require('path');
const { createLogger } = require('../utils/error-handler');

// Initialize logger
const logger = createLogger('update-all-models');

// Configuration
const CONFIG = {
  // Available provider scripts
  providers: {
    anthropic: {
      name: 'Anthropic',
      script: 'update-anthropic-models.js',
      flag: '--anthropic'
    },
    openai: {
      name: 'OpenAI',
      script: 'update-openai-models.js', 
      flag: '--openai'
    },
    ideogram: {
      name: 'Ideogram',
      script: 'update-ideogram-models.js',
      flag: '--ideogram'
    },
    openrouter: {
      name: 'OpenRouter',
      script: 'update-openrouter-models.js',
      flag: '--openrouter'
    },
    together: {
      name: 'Together AI',
      script: 'update-together-models.js',
      flag: '--together'
    },
    veo3: {
      name: 'Google Veo3',
      script: 'update-veo3-models.js',
      flag: '--veo3'
    },
    runway: {
      name: 'Runway',
      script: 'update-runway-models.js',
      flag: '--runway'
    },
    nova: {
      name: 'Amazon Nova',
      script: 'update-nova-models.js',
      flag: '--nova'
    }
  },
  // Script execution timeout (10 minutes per script)
  scriptTimeout: 10 * 60 * 1000
};

/**
 * Parses command line arguments to determine which providers to run
 * @returns {Array<string>} Array of provider keys to execute
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const selectedProviders = [];
  
  // Check for provider flags
  for (const [key, provider] of Object.entries(CONFIG.providers)) {
    if (args.includes(provider.flag)) {
      selectedProviders.push(key);
    }
  }
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    displayHelp();
    process.exit(0);
  }
  
  // If no specific providers selected, run all
  if (selectedProviders.length === 0) {
    return Object.keys(CONFIG.providers);
  }
  
  return selectedProviders;
}

/**
 * Displays help information
 */
function displayHelp() {
  console.log(`
🚀 Unified Models Update Script

This script updates model data from various AI providers.

USAGE:
  node scripts/update-models-info/update-all-models.js [OPTIONS]

OPTIONS:
  --help, -h         Show this help message
  --anthropic        Update only Anthropic models
  --openai           Update only OpenAI models  
  --ideogram         Update only Ideogram models
  --openrouter       Update only OpenRouter models
  --together         Update only Together AI models
  --veo3             Update only Google Veo3 models
  --runway           Update only Runway models
  --nova             Update only Amazon Nova models

EXAMPLES:
  node scripts/update-models-info/update-all-models.js                    # Update all providers
  node scripts/update-models-info/update-all-models.js --anthropic        # Update only Anthropic
  node scripts/update-models-info/update-all-models.js --openai --ideogram # Update OpenAI and Ideogram
  node scripts/update-models-info/update-all-models.js --veo3 --runway    # Update video models

PROVIDERS:
${Object.entries(CONFIG.providers).map(([key, provider]) => 
  `  ${provider.flag.padEnd(12)} ${provider.name}`
).join('\n')}
  `);
}

/**
 * Executes a provider update script
 * @param {string} providerKey - Provider key (e.g., 'anthropic')
 * @returns {Promise<Object>} Execution result with success status and details
 */
async function executeProviderScript(providerKey) {
  const provider = CONFIG.providers[providerKey];
  const scriptPath = path.join(__dirname, provider.script);
  
  logger.info(`🚀 Starting ${provider.name} models update...`);
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const childProcess = spawn('node', [scriptPath], {
      stdio: 'pipe',
      cwd: path.dirname(path.dirname(__dirname))
    });
    
    let stdout = '';
    let stderr = '';
    
    // Capture output
    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      // Forward output to console in real-time
      process.stdout.write(output);
    });
    
    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      // Forward stderr to console in real-time  
      process.stderr.write(output);
    });
    
    // Handle script completion
    childProcess.on('close', (code) => {
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      const result = {
        provider: providerKey,
        name: provider.name,
        success: code === 0,
        exitCode: code,
        duration,
        stdout,
        stderr
      };
      
      if (code === 0) {
        logger.info(`✅ ${provider.name} update completed successfully (${duration}s)`);
      } else {
        logger.error(`❌ ${provider.name} update failed with exit code ${code} (${duration}s)`);
      }
      
      resolve(result);
    });
    
    // Handle script errors
    childProcess.on('error', (error) => {
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      logger.error(`❌ Failed to start ${provider.name} script:`, error);
      
      resolve({
        provider: providerKey,
        name: provider.name,
        success: false,
        exitCode: -1,
        duration,
        error: error.message,
        stdout,
        stderr
      });
    });
    
    // Set timeout
    const timeout = setTimeout(() => {
      logger.warn(`⏰ ${provider.name} script timeout, killing process...`);
      childProcess.kill('SIGKILL');
    }, CONFIG.scriptTimeout);
    
    childProcess.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Executes multiple provider scripts sequentially
 * @param {Array<string>} providerKeys - Array of provider keys to execute
 * @returns {Promise<Array<Object>>} Array of execution results
 */
async function executeProviderScripts(providerKeys) {
  const results = [];
  
  logger.info(`📋 Executing ${providerKeys.length} provider update scripts...`);
  logger.info(`Providers: ${providerKeys.map(key => CONFIG.providers[key].name).join(', ')}`);
  logger.info('');
  
  for (let i = 0; i < providerKeys.length; i++) {
    const providerKey = providerKeys[i];
    const provider = CONFIG.providers[providerKey];
    
    logger.info(`[${i + 1}/${providerKeys.length}] Processing ${provider.name}...`);
    
    try {
      const result = await executeProviderScript(providerKey);
      results.push(result);
      
      // Add spacing between scripts
      if (i < providerKeys.length - 1) {
        logger.info('');
        logger.info('─'.repeat(50));
        logger.info('');
      }
      
    } catch (error) {
      logger.error(`Unexpected error executing ${provider.name}:`, error);
      results.push({
        provider: providerKey,
        name: provider.name,
        success: false,
        exitCode: -2,
        duration: 0,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Generates and displays a summary report of all executions
 * @param {Array<Object>} results - Array of execution results
 */
function generateSummaryReport(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  logger.info('');
  logger.info('═'.repeat(60));
  logger.info('📊 UNIFIED MODELS UPDATE SUMMARY');
  logger.info('═'.repeat(60));
  logger.info(`⏱️  Total duration: ${totalDuration}s`);
  logger.info(`📈 Total providers processed: ${results.length}`);
  logger.info(`✅ Successful updates: ${successful.length}`);
  logger.info(`❌ Failed updates: ${failed.length}`);
  logger.info('');
  
  if (successful.length > 0) {
    logger.info('✅ SUCCESSFUL UPDATES:');
    successful.forEach(result => {
      logger.info(`   • ${result.name} (${result.duration}s)`);
    });
    logger.info('');
  }
  
  if (failed.length > 0) {
    logger.info('❌ FAILED UPDATES:');
    failed.forEach(result => {
      logger.error(`   • ${result.name} (exit code: ${result.exitCode})`);
      if (result.error) {
        logger.error(`     Error: ${result.error}`);
      }
    });
    logger.info('');
  }
  
  // Overall status
  if (failed.length === 0) {
    logger.info('🎉 All provider updates completed successfully!');
  } else if (successful.length > 0) {
    logger.warn(`⚠️  Completed with ${failed.length} failures out of ${results.length} providers`);
  } else {
    logger.error('💥 All provider updates failed!');
  }
  
  logger.info('═'.repeat(60));
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  
  logger.info('🚀 Starting Unified Models Update...');
  logger.info('');
  
  try {
    // Parse command line arguments
    const selectedProviders = parseCommandLineArgs();
    
    if (selectedProviders.length === 0) {
      logger.error('No valid providers specified');
      process.exit(1);
    }
    
    // Validate all selected providers exist
    const invalidProviders = selectedProviders.filter(key => !CONFIG.providers[key]);
    if (invalidProviders.length > 0) {
      logger.error(`Invalid providers specified: ${invalidProviders.join(', ')}`);
      logger.info('Available providers: ' + Object.keys(CONFIG.providers).join(', '));
      process.exit(1);
    }
    
    // Execute provider scripts
    const results = await executeProviderScripts(selectedProviders);
    
    // Generate summary report
    generateSummaryReport(results);
    
    // Determine exit code
    const hasFailures = results.some(r => !r.success);
    const exitCode = hasFailures ? 1 : 0;
    
    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    logger.info(`Script completed in ${totalDuration}s`);
    
    process.exit(exitCode);
    
  } catch (error) {
    logger.error('❌ Fatal error during unified models update:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  executeProviderScript,
  executeProviderScripts,
  parseCommandLineArgs
};