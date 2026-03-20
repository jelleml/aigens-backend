/**
 * Progress Tracker for CLI Operations
 * 
 * Provides visual progress indicators, operation tracking, and status updates
 * for long-running CLI operations with customizable display formats.
 */

const cliProgress = require('cli-progress');
const chalk = require('chalk');

/**
 * ProgressTracker class
 */
class ProgressTracker {
  constructor() {
    this.activeBars = new Map();
    this.multiBarInstance = null;
  }

  /**
   * Create a single progress bar
   * @param {Object} options - Progress bar options
   * @param {number} options.total - Total number of items
   * @param {string} options.format - Progress bar format string
   * @param {Object} options.barOptions - Additional bar options
   * @returns {Object} Progress bar instance
   */
  createProgress(options = {}) {
    const {
      total = 100,
      format = 'Progress [{bar}] {percentage}% | {value}/{total} | ETA: {eta}s',
      barOptions = {}
    } = options;

    const defaultBarOptions = {
      format: chalk.cyan(format),
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: true,
      ...barOptions
    };

    const progressBar = new cliProgress.SingleBar(defaultBarOptions);
    progressBar.start(total, 0);
    
    const barId = `bar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeBars.set(barId, progressBar);

    return {
      id: barId,
      increment: (value = 1, payload = {}) => {
        progressBar.increment(value, payload);
      },
      update: (current, payload = {}) => {
        progressBar.update(current, payload);
      },
      setTotal: (total) => {
        progressBar.setTotal(total);
      },
      stop: () => {
        progressBar.stop();
        this.activeBars.delete(barId);
      },
      getProgress: () => {
        return progressBar.getProgress();
      }
    };
  }

  /**
   * Create a multi-progress bar container
   * @param {Object} options - Multi-bar options
   * @returns {Object} Multi-bar instance
   */
  createMultiProgress(options = {}) {
    const defaultOptions = {
      format: chalk.cyan('Progress [{bar}] {percentage}% | {value}/{total} | {name}'),
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: false,
      ...options
    };

    this.multiBarInstance = new cliProgress.MultiBar(defaultOptions);
    
    return {
      create: (total, startValue = 0, payload = {}) => {
        const bar = this.multiBarInstance.create(total, startValue, payload);
        return {
          increment: (value = 1, payload = {}) => bar.increment(value, payload),
          update: (current, payload = {}) => bar.update(current, payload),
          setTotal: (total) => bar.setTotal(total),
          remove: () => this.multiBarInstance.remove(bar)
        };
      },
      stop: () => {
        this.multiBarInstance.stop();
        this.multiBarInstance = null;
      },
      update: () => {
        if (this.multiBarInstance) {
          this.multiBarInstance.update();
        }
      }
    };
  }

  /**
   * Create a task-based progress tracker
   * @param {Array} tasks - Array of task objects
   * @param {Object} options - Progress options
   * @returns {Object} Task progress tracker
   */
  createTaskProgress(tasks, options = {}) {
    const taskMap = new Map();
    const totalTasks = tasks.length;
    let completedTasks = 0;
    
    const multiBar = this.createMultiProgress({
      format: options.format || chalk.cyan('{name} [{bar}] {percentage}% | {status}'),
      ...options
    });

    // Create progress bars for each task
    tasks.forEach((task, index) => {
      const bar = multiBar.create(100, 0, {
        name: task.name || `Task ${index + 1}`,
        status: 'Pending'
      });
      
      taskMap.set(task.id || task.name || index, {
        bar,
        task,
        status: 'pending',
        progress: 0
      });
    });

    return {
      updateTask: (taskId, progress, status = null) => {
        const taskInfo = taskMap.get(taskId);
        if (taskInfo) {
          taskInfo.progress = progress;
          if (status) {
            taskInfo.status = status;
          }
          
          taskInfo.bar.update(progress, {
            name: taskInfo.task.name || `Task ${taskId}`,
            status: this.formatTaskStatus(taskInfo.status)
          });
          
          // Check if task completed
          if (progress >= 100 && taskInfo.status !== 'completed') {
            taskInfo.status = 'completed';
            completedTasks++;
          }
        }
      },
      
      completeTask: (taskId, status = 'completed') => {
        const taskInfo = taskMap.get(taskId);
        if (taskInfo && taskInfo.status !== 'completed') {
          taskInfo.status = status;
          taskInfo.progress = 100;
          completedTasks++;
          
          taskInfo.bar.update(100, {
            name: taskInfo.task.name || `Task ${taskId}`,
            status: this.formatTaskStatus(status)
          });
        }
      },
      
      failTask: (taskId, error = null) => {
        const taskInfo = taskMap.get(taskId);
        if (taskInfo) {
          taskInfo.status = 'failed';
          taskInfo.error = error;
          
          taskInfo.bar.update(taskInfo.progress, {
            name: taskInfo.task.name || `Task ${taskId}`,
            status: this.formatTaskStatus('failed')
          });
        }
      },
      
      getOverallProgress: () => {
        return Math.round((completedTasks / totalTasks) * 100);
      },
      
      getTaskStatus: (taskId) => {
        const taskInfo = taskMap.get(taskId);
        return taskInfo ? {
          status: taskInfo.status,
          progress: taskInfo.progress,
          error: taskInfo.error
        } : null;
      },
      
      getAllTasksStatus: () => {
        const status = {};
        taskMap.forEach((taskInfo, taskId) => {
          status[taskId] = {
            name: taskInfo.task.name,
            status: taskInfo.status,
            progress: taskInfo.progress,
            error: taskInfo.error
          };
        });
        return status;
      },
      
      stop: () => {
        multiBar.stop();
      },
      
      isComplete: () => {
        return completedTasks >= totalTasks;
      }
    };
  }

  /**
   * Create a step-by-step progress indicator
   * @param {Array} steps - Array of step names
   * @param {Object} options - Step options
   * @returns {Object} Step progress tracker
   */
  createStepProgress(steps, options = {}) {
    let currentStep = 0;
    const totalSteps = steps.length;
    
    const displayStep = () => {
      console.log(chalk.blue('\n📋 Progress Overview:'));
      
      steps.forEach((step, index) => {
        let icon, color;
        
        if (index < currentStep) {
          icon = '✅';
          color = 'green';
        } else if (index === currentStep) {
          icon = '🔄';
          color = 'yellow';
        } else {
          icon = '⏳';
          color = 'gray';
        }
        
        console.log(`  ${icon} ${chalk[color](step)}`);
      });
      
      const percentage = Math.round((currentStep / totalSteps) * 100);
      console.log(`\n📊 Overall Progress: ${percentage}% (${currentStep}/${totalSteps})\n`);
    };

    // Initial display
    displayStep();

    return {
      nextStep: (message = null) => {
        if (currentStep < totalSteps) {
          currentStep++;
          
          if (message) {
            console.log(chalk.cyan(`\n▶️  ${message}`));
          }
          
          displayStep();
        }
      },
      
      complete: () => {
        currentStep = totalSteps;
        displayStep();
        console.log(chalk.green.bold('🎉 All steps completed!\n'));
      },
      
      getCurrentStep: () => currentStep,
      getTotalSteps: () => totalSteps,
      getProgress: () => Math.round((currentStep / totalSteps) * 100),
      
      reset: () => {
        currentStep = 0;
        displayStep();
      }
    };
  }

  /**
   * Create a spinner with progress information
   * @param {string} text - Spinner text
   * @param {Object} options - Spinner options
   * @returns {Object} Spinner instance
   */
  createSpinner(text, options = {}) {
    const ora = require('ora');
    
    const spinner = ora({
      text: chalk.cyan(text),
      color: options.color || 'cyan',
      spinner: options.spinner || 'dots',
      ...options
    });

    return {
      start: (newText = null) => {
        if (newText) {
          spinner.text = chalk.cyan(newText);
        }
        spinner.start();
        return spinner;
      },
      
      succeed: (text = null) => {
        spinner.succeed(text ? chalk.green(text) : undefined);
      },
      
      fail: (text = null) => {
        spinner.fail(text ? chalk.red(text) : undefined);
      },
      
      warn: (text = null) => {
        spinner.warn(text ? chalk.yellow(text) : undefined);
      },
      
      info: (text = null) => {
        spinner.info(text ? chalk.blue(text) : undefined);
      },
      
      stop: () => {
        spinner.stop();
      },
      
      updateText: (newText) => {
        spinner.text = chalk.cyan(newText);
      }
    };
  }

  /**
   * Create a progress tracker for file operations
   * @param {Object} options - File progress options
   * @returns {Object} File progress tracker
   */
  createFileProgress(options = {}) {
    const {
      totalSize = 0,
      filename = 'File',
      showSpeed = true,
      showETA = true
    } = options;

    let startTime = Date.now();
    let lastUpdate = startTime;
    let transferredBytes = 0;

    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatSpeed = (bytesPerSecond) => {
      return formatBytes(bytesPerSecond) + '/s';
    };

    const formatTime = (seconds) => {
      if (seconds < 60) return `${Math.round(seconds)}s`;
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    };

    const progress = this.createProgress({
      total: totalSize,
      format: `${filename} [{bar}] {percentage}% | {value_formatted}/{total_formatted}` +
              (showSpeed ? ' | {speed}' : '') +
              (showETA ? ' | ETA: {eta}' : ''),
      barOptions: {
        formatValue: (v, options, type) => {
          if (type === 'value' || type === 'total') {
            return formatBytes(v);
          }
          return v;
        }
      }
    });

    return {
      update: (bytes) => {
        transferredBytes += bytes;
        const now = Date.now();
        const timeDiff = (now - lastUpdate) / 1000;
        
        let payload = {
          value_formatted: formatBytes(transferredBytes),
          total_formatted: formatBytes(totalSize)
        };

        if (showSpeed && timeDiff > 0) {
          const speed = bytes / timeDiff;
          payload.speed = formatSpeed(speed);
        }

        if (showETA && transferredBytes > 0) {
          const elapsedTime = (now - startTime) / 1000;
          const avgSpeed = transferredBytes / elapsedTime;
          const remainingBytes = totalSize - transferredBytes;
          const eta = remainingBytes / avgSpeed;
          payload.eta = formatTime(eta);
        }

        progress.update(transferredBytes, payload);
        lastUpdate = now;
      },
      
      complete: () => {
        progress.update(totalSize, {
          value_formatted: formatBytes(totalSize),
          total_formatted: formatBytes(totalSize),
          speed: showSpeed ? 'Complete' : undefined,
          eta: showETA ? 'Complete' : undefined
        });
        progress.stop();
      },
      
      stop: () => {
        progress.stop();
      }
    };
  }

  /**
   * Format task status for display
   * @param {string} status - Task status
   * @returns {string} Formatted status
   */
  formatTaskStatus(status) {
    const statusMap = {
      'pending': chalk.gray('Pending'),
      'running': chalk.yellow('Running'),
      'completed': chalk.green('Completed'),
      'failed': chalk.red('Failed'),
      'skipped': chalk.blue('Skipped'),
      'cancelled': chalk.magenta('Cancelled')
    };
    
    return statusMap[status] || chalk.gray(status);
  }

  /**
   * Stop all active progress bars
   */
  stopAll() {
    this.activeBars.forEach(bar => bar.stop());
    this.activeBars.clear();
    
    if (this.multiBarInstance) {
      this.multiBarInstance.stop();
      this.multiBarInstance = null;
    }
  }

  /**
   * Get active progress bars count
   * @returns {number} Number of active progress bars
   */
  getActiveCount() {
    return this.activeBars.size + (this.multiBarInstance ? 1 : 0);
  }
}

module.exports = { ProgressTracker };