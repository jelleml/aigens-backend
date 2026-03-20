#!/usr/bin/env node

/**
 * Model Management System - Cronjob Deployment Script
 * 
 * This script automates the deployment of model management cronjobs
 * to the system's crontab. It creates necessary directories, sets up
 * log rotation, and configures the crontab entries.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

// Configuration
const CONFIG = {
  appPath: process.cwd(),
  logDir: '/var/log/model-management',
  cronFile: '/etc/cron.d/model-management',
  templatePath: path.join(process.cwd(), 'scripts', 'model-management', 'cronjobs', 'crontab-template.txt'),
  user: process.env.USER || 'root'
};

/**
 * Main execution function
 */
async function main() {
  console.log('Model Management System - Cronjob Deployment');
  console.log('===========================================');
  
  try {
    // Check if running as root
    const isRoot = process.getuid && process.getuid() === 0;
    if (!isRoot) {
      console.warn('\nWARNING: This script should be run as root to properly set up system cronjobs.');
      console.warn('Some operations may fail without root privileges.\n');
      
      const shouldContinue = await promptYesNo('Continue anyway?');
      if (!shouldContinue) {
        console.log('Deployment cancelled.');
        process.exit(0);
      }
    }
    
    // Create log directory
    await createLogDirectory();
    
    // Set up log rotation
    await setupLogRotation();
    
    // Deploy cronjobs
    await deployCronjobs();
    
    // Verify deployment
    await verifyDeployment();
    
    console.log('\nDeployment completed successfully!');
    console.log('Run "sudo crontab -l" to verify the cronjobs are installed.');
    
  } catch (error) {
    console.error('\nDeployment failed:', error.message);
    process.exit(1);
  }
}

/**
 * Create log directory
 * @returns {Promise<void>}
 */
async function createLogDirectory() {
  console.log(`\nCreating log directory: ${CONFIG.logDir}`);
  
  try {
    await access(CONFIG.logDir, fs.constants.F_OK);
    console.log('Log directory already exists.');
  } catch (error) {
    try {
      await mkdir(CONFIG.logDir, { recursive: true });
      console.log('Log directory created successfully.');
      
      // Set permissions
      execSync(`chmod 755 ${CONFIG.logDir}`);
      console.log('Log directory permissions set.');
    } catch (mkdirError) {
      throw new Error(`Failed to create log directory: ${mkdirError.message}`);
    }
  }
}

/**
 * Set up log rotation
 * @returns {Promise<void>}
 */
async function setupLogRotation() {
  console.log('\nSetting up log rotation...');
  
  const logrotateConfig = `${CONFIG.logDir}/*.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  create 0644 ${CONFIG.user} ${CONFIG.user}
  sharedscripts
  postrotate
    systemctl reload rsyslog >/dev/null 2>&1 || true
  endscript
}`;

  const logrotateFile = '/etc/logrotate.d/model-management';
  
  try {
    await writeFile(logrotateFile, logrotateConfig);
    console.log('Log rotation configuration created successfully.');
  } catch (error) {
    console.warn(`Warning: Failed to create log rotation config: ${error.message}`);
    console.warn('You may need to manually set up log rotation.');
  }
}

/**
 * Deploy cronjobs
 * @returns {Promise<void>}
 */
async function deployCronjobs() {
  console.log('\nDeploying cronjobs...');
  
  try {
    // Read template file
    let template = await readFile(CONFIG.templatePath, 'utf8');
    
    // Replace placeholders
    template = template.replace(/\/path\/to\/aigens-backend/g, CONFIG.appPath);
    template = template.replace(/\$LOG_DIR/g, CONFIG.logDir);
    
    // Write to cron.d directory
    try {
      await writeFile(CONFIG.cronFile, template);
      console.log(`Cronjobs deployed to ${CONFIG.cronFile}`);
      
      // Set permissions
      execSync(`chmod 644 ${CONFIG.cronFile}`);
      console.log('Crontab file permissions set.');
    } catch (writeError) {
      console.warn(`Warning: Failed to write to ${CONFIG.cronFile}: ${writeError.message}`);
      console.warn('Falling back to user crontab...');
      
      // Fall back to user crontab
      const userCrontab = execSync('crontab -l').toString('utf8').trim() || '';
      
      // Check if our cronjobs are already in the crontab
      if (userCrontab.includes('Model Management System Cronjobs')) {
        console.log('Cronjobs already exist in user crontab.');
      } else {
        // Add our cronjobs to user crontab
        const newCrontab = userCrontab + '\n\n' + template;
        
        // Write to temporary file
        const tempFile = path.join(process.cwd(), 'temp-crontab');
        await writeFile(tempFile, newCrontab);
        
        // Install new crontab
        execSync(`crontab ${tempFile}`);
        
        // Clean up
        fs.unlinkSync(tempFile);
        
        console.log('Cronjobs added to user crontab.');
      }
    }
  } catch (error) {
    throw new Error(`Failed to deploy cronjobs: ${error.message}`);
  }
}

/**
 * Verify deployment
 * @returns {Promise<void>}
 */
async function verifyDeployment() {
  console.log('\nVerifying deployment...');
  
  try {
    // Check if scripts are executable
    const scripts = [
      'scripts/model-management/cronjobs/sync-all-models.js',
      'scripts/model-management/cronjobs/health-check.js'
    ];
    
    for (const script of scripts) {
      const scriptPath = path.join(CONFIG.appPath, script);
      
      try {
        await access(scriptPath, fs.constants.X_OK);
      } catch (error) {
        console.log(`Making ${script} executable...`);
        execSync(`chmod +x ${scriptPath}`);
      }
    }
    
    // Test scripts
    console.log('Testing sync-all-models.js with --dry-run...');
    execSync(`node ${path.join(CONFIG.appPath, 'scripts/model-management/cronjobs/sync-all-models.js')} --dry-run`, { stdio: 'inherit' });
    
    console.log('Testing health-check.js with --dry-run...');
    execSync(`node ${path.join(CONFIG.appPath, 'scripts/model-management/cronjobs/health-check.js')} --dry-run`, { stdio: 'inherit' });
    
    console.log('Verification completed successfully.');
  } catch (error) {
    console.warn(`Warning: Verification failed: ${error.message}`);
    console.warn('You may need to manually verify the cronjob setup.');
  }
}

/**
 * Prompt for yes/no input
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>} User response
 */
async function promptYesNo(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Make script executable
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { main };