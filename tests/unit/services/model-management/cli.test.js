/**
 * Comprehensive Tests for CLI Components
 * 
 * Tests all CLI functionality including core commands, interactive mode,
 * configuration management, and progress tracking.
 */

const { ModelManagementCLI } = require('../../../../services/model-management/cli/cli-core');
const { ProgressTracker } = require('../../../../services/model-management/cli/progress-tracker');
const { CLIConfig } = require('../../../../services/model-management/cli/cli-config');
const { OutputFormatter } = require('../../../../services/model-management/cli/output-formatter');

// Mock dependencies
jest.mock('inquirer');
jest.mock('ora');
jest.mock('cli-table3');
jest.mock('boxen');
jest.mock('cli-progress');

// Mock database
jest.mock('../../../../database', () => ({
  models: {
    Provider: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      findByPk: jest.fn()
    },
    Model: {
      findAll: jest.fn(),
      count: jest.fn()
    },
    ProviderHealthStatus: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn()
    },
    ModelSyncLog: {
      findAll: jest.fn()
    }
  },
  sequelize: {
    authenticate: jest.fn()
  },
  Sequelize: {
    Op: {
      or: Symbol('or'),
      iLike: Symbol('iLike')
    }
  }
}));

describe('CLI Components', () => {
  
  describe('ModelManagementCLI', () => {
    let cli;
    let mockMonitoring;
    let mockLogger;
    let mockMetrics;

    beforeEach(() => {
      mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        generateCorrelationId: jest.fn(() => 'test-correlation-123')
      };

      mockMetrics = {
        startTimer: jest.fn(() => 'timer-123'),
        endTimer: jest.fn(),
        increment: jest.fn(),
        gauge: jest.fn(),
        getMetrics: jest.fn(() => ({
          timestamp: Date.now(),
          metrics: {}
        })),
        getSummary: jest.fn(() => ({
          totalMetrics: 10,
          activeTimers: 2,
          uptime: 60000
        }))
      };

      mockMonitoring = {
        getLogger: jest.fn(() => mockLogger),
        getMetrics: jest.fn(() => mockMetrics),
        performHealthCheck: jest.fn(() => Promise.resolve({
          status: 'healthy',
          checks: {
            database: { status: 'healthy', message: 'OK' },
            memory: { status: 'healthy', message: 'OK' }
          }
        })),
        getStatus: jest.fn(() => ({
          service: 'model-management',
          version: '1.0.0',
          uptime: 60000,
          components: { logger: true, metrics: true }
        }))
      };

      cli = new ModelManagementCLI({
        monitoring: mockMonitoring,
        version: '1.0.0'
      });
    });

    describe('Initialization', () => {
      it('should initialize CLI with monitoring service', () => {
        expect(cli.monitoring).toBe(mockMonitoring);
        expect(cli.logger).toBe(mockLogger);
        expect(cli.metrics).toBe(mockMetrics);
        expect(cli.version).toBe('1.0.0');
      });

      it('should initialize CLI components', () => {
        expect(cli.config).toBeInstanceOf(CLIConfig);
        expect(cli.formatter).toBeInstanceOf(OutputFormatter);
        expect(cli.progressTracker).toBeInstanceOf(ProgressTracker);
      });

      it('should log initialization', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          'CLI Core initialized',
          { version: '1.0.0' }
        );
      });
    });

    describe('executeSync', () => {
      beforeEach(() => {
        const db = require('../../../../database');
        db.models.Provider.findAll.mockResolvedValue([
          { id: 1, name: 'openai', provider_type: 'openai', is_active: true },
          { id: 2, name: 'anthropic', provider_type: 'anthropic', is_active: true }
        ]);
      });

      it('should execute sync command successfully', async () => {
        const options = { provider: ['openai'], parallel: 2 };
        const globalOptions = {};

        // Mock console.log to avoid output during tests
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeSync(options, globalOptions);

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Sync command started',
          expect.objectContaining({
            correlationId: 'test-correlation-123',
            options
          })
        );

        expect(mockMetrics.startTimer).toHaveBeenCalledWith('cli_sync_command');
        consoleSpy.restore();
      });

      it('should handle dry run mode', async () => {
        const options = { provider: ['openai'] };
        const globalOptions = { dryRun: true };

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeSync(options, globalOptions);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('DRY RUN MODE')
        );

        consoleSpy.restore();
      });

      it('should handle provider not found error', async () => {
        const db = require('../../../../database');
        db.models.Provider.findAll.mockResolvedValue([]);

        const options = { provider: ['nonexistent'] };
        const globalOptions = {};

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        await cli.executeSync(options, globalOptions);

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('No active providers found')
        );

        exitSpy.restore();
        consoleSpy.restore();
      });
    });

    describe('executeHealth', () => {
      it('should execute health check successfully', async () => {
        const options = {};
        const globalOptions = {};

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeHealth(options, globalOptions);

        expect(mockMonitoring.performHealthCheck).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('System Health Check')
        );

        consoleSpy.restore();
      });

      it('should handle health check failure', async () => {
        mockMonitoring.performHealthCheck.mockRejectedValue(
          new Error('Health check failed')
        );

        const options = {};
        const globalOptions = {};

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        await cli.executeHealth(options, globalOptions);

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Health check failed')
        );

        exitSpy.restore();
        consoleSpy.restore();
      });
    });

    describe('executeMetrics', () => {
      it('should display metrics successfully', async () => {
        const options = {};
        const globalOptions = {};

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeMetrics(options, globalOptions);

        expect(mockMetrics.getMetrics).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('System Metrics')
        );

        consoleSpy.restore();
      });

      it('should handle watch mode', async () => {
        const options = { watch: true, interval: 2 };
        const globalOptions = {};

        // Mock setInterval and clearInterval
        const originalSetInterval = global.setInterval;
        const originalClearInterval = global.clearInterval;
        const mockIntervalId = 'mock-interval';
        
        global.setInterval = jest.fn(() => mockIntervalId);
        global.clearInterval = jest.fn();

        // Mock process.on to simulate SIGINT
        const originalProcessOn = process.on;
        process.on = jest.fn((event, handler) => {
          if (event === 'SIGINT') {
            // Immediately call the handler to simulate Ctrl+C
            setTimeout(() => handler(), 10);
          }
        });

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        const consoleClearSpy = jest.spyOn(console, 'clear').mockImplementation();

        await cli.executeMetrics(options, globalOptions);

        // Restore mocks
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
        process.on = originalProcessOn;
        exitSpy.restore();
        consoleSpy.restore();
        consoleClearSpy.restore();
      });
    });

    describe('executeProviders', () => {
      beforeEach(() => {
        const db = require('../../../../database');
        db.models.Provider.findAll.mockResolvedValue([
          {
            id: 1,
            name: 'openai',
            provider_type: 'openai',
            is_active: true,
            healthStatus: {
              status: 'healthy',
              models_count: 25
            }
          }
        ]);
      });

      it('should list providers successfully', async () => {
        const options = { list: true };
        const globalOptions = {};

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeProviders(options, globalOptions);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Provider Management')
        );

        consoleSpy.restore();
      });

      it('should enable provider successfully', async () => {
        const db = require('../../../../database');
        const mockProvider = {
          update: jest.fn().mockResolvedValue()
        };
        db.models.Provider.findOne.mockResolvedValue(mockProvider);

        const options = { enable: 'openai' };
        const globalOptions = {};

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeProviders(options, globalOptions);

        expect(mockProvider.update).toHaveBeenCalledWith({ is_active: true });
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Provider openai enabled')
        );

        consoleSpy.restore();
      });

      it('should handle provider not found', async () => {
        const db = require('../../../../database');
        db.models.Provider.findOne.mockResolvedValue(null);

        const options = { enable: 'nonexistent' };
        const globalOptions = {};

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        await cli.executeProviders(options, globalOptions);

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Provider not found')
        );

        exitSpy.restore();
        consoleSpy.restore();
      });
    });

    describe('executeModels', () => {
      beforeEach(() => {
        const db = require('../../../../database');
        db.models.Model.findAll.mockResolvedValue([
          {
            id: 1,
            model_name: 'gpt-4',
            model_type: 'chat',
            is_active: true,
            is_deprecated: false,
            updated_at: new Date(),
            provider: {
              name: 'openai'
            }
          }
        ]);
      });

      it('should list models successfully', async () => {
        const options = { list: true };
        const globalOptions = {};

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeModels(options, globalOptions);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Model Management')
        );

        consoleSpy.restore();
      });

      it('should filter models by provider', async () => {
        const options = { provider: 'openai' };
        const globalOptions = {};

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeModels(options, globalOptions);

        const db = require('../../../../database');
        expect(db.models.Model.findAll).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.arrayContaining([
              expect.objectContaining({
                where: { name: 'openai' }
              })
            ])
          })
        );

        consoleSpy.restore();
      });
    });

    describe('executeStatus', () => {
      it('should show status in default format', async () => {
        const options = {};
        const globalOptions = {};

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeStatus(options, globalOptions);

        expect(mockMonitoring.getStatus).toHaveBeenCalled();
        expect(mockMonitoring.performHealthCheck).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('System Status')
        );

        consoleSpy.restore();
      });

      it('should show status in JSON format', async () => {
        const options = { json: true };
        const globalOptions = {};

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.executeStatus(options, globalOptions);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/^\{/)
        );

        consoleSpy.restore();
      });
    });

    describe('startInteractiveMode', () => {
      it('should start interactive mode', async () => {
        const inquirer = require('inquirer');
        inquirer.prompt = jest.fn()
          .mockResolvedValueOnce({ action: 'health' })
          .mockResolvedValueOnce({ action: 'exit' })
          .mockResolvedValue({ continue: '' });

        const options = {};
        const globalOptions = {};

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await cli.startInteractiveMode(options, globalOptions);

        expect(inquirer.prompt).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Interactive Mode')
        );

        consoleSpy.restore();
      });
    });

    describe('Utility Methods', () => {
      it('should simulate provider sync', async () => {
        const provider = { name: 'test-provider' };
        
        // Should complete without error for most cases
        await expect(cli.simulateProviderSync(provider, false))
          .resolves.toBeUndefined();
      });

      it('should wait for available slot', async () => {
        const semaphore = [null, true, null];
        
        const slotIndex = await cli.waitForSlot(semaphore);
        
        expect(slotIndex).toBeGreaterThanOrEqual(0);
        expect(slotIndex).toBeLessThan(semaphore.length);
        expect(semaphore[slotIndex]).toBe(true);
      });

      it('should format sync results', () => {
        const results = [
          { provider: 'openai', status: 'success', models: 25, duration: 1500 },
          { provider: 'anthropic', status: 'error', duration: 800 }
        ];

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        cli.displaySyncResults(results);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Sync Results')
        );

        consoleSpy.restore();
      });
    });
  });

  describe('ProgressTracker', () => {
    let progressTracker;

    beforeEach(() => {
      progressTracker = new ProgressTracker();
    });

    afterEach(() => {
      progressTracker.stopAll();
    });

    describe('createProgress', () => {
      it('should create a single progress bar', () => {
        const progress = progressTracker.createProgress({
          total: 100,
          format: 'Test [{bar}] {percentage}%'
        });

        expect(progress.id).toBeDefined();
        expect(typeof progress.increment).toBe('function');
        expect(typeof progress.update).toBe('function');
        expect(typeof progress.stop).toBe('function');
      });

      it('should track active progress bars', () => {
        const progress1 = progressTracker.createProgress({ total: 50 });
        const progress2 = progressTracker.createProgress({ total: 100 });

        expect(progressTracker.getActiveCount()).toBe(2);

        progress1.stop();
        expect(progressTracker.getActiveCount()).toBe(1);

        progress2.stop();
        expect(progressTracker.getActiveCount()).toBe(0);
      });
    });

    describe('createTaskProgress', () => {
      it('should create task-based progress tracker', () => {
        const tasks = [
          { id: 'task1', name: 'First Task' },
          { id: 'task2', name: 'Second Task' }
        ];

        const taskProgress = progressTracker.createTaskProgress(tasks);

        expect(typeof taskProgress.updateTask).toBe('function');
        expect(typeof taskProgress.completeTask).toBe('function');
        expect(typeof taskProgress.getOverallProgress).toBe('function');

        taskProgress.updateTask('task1', 50);
        taskProgress.completeTask('task2');

        expect(taskProgress.getOverallProgress()).toBe(50);
        expect(taskProgress.getTaskStatus('task1')).toEqual({
          status: 'pending',
          progress: 50,
          error: undefined
        });

        taskProgress.stop();
      });

      it('should handle task failures', () => {
        const tasks = [{ id: 'task1', name: 'Test Task' }];
        const taskProgress = progressTracker.createTaskProgress(tasks);

        taskProgress.failTask('task1', new Error('Task failed'));

        const status = taskProgress.getTaskStatus('task1');
        expect(status.status).toBe('failed');
        expect(status.error).toBeInstanceOf(Error);

        taskProgress.stop();
      });
    });

    describe('createStepProgress', () => {
      it('should create step-by-step progress', () => {
        const steps = ['Step 1', 'Step 2', 'Step 3'];
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const stepProgress = progressTracker.createStepProgress(steps);

        expect(stepProgress.getCurrentStep()).toBe(0);
        expect(stepProgress.getTotalSteps()).toBe(3);
        expect(stepProgress.getProgress()).toBe(0);

        stepProgress.nextStep('Starting Step 1');
        expect(stepProgress.getCurrentStep()).toBe(1);
        expect(stepProgress.getProgress()).toBeCloseTo(33.33);

        stepProgress.complete();
        expect(stepProgress.getCurrentStep()).toBe(3);
        expect(stepProgress.getProgress()).toBe(100);

        consoleSpy.restore();
      });
    });

    describe('createFileProgress', () => {
      it('should create file progress tracker', () => {
        const fileProgress = progressTracker.createFileProgress({
          totalSize: 1000,
          filename: 'test.txt',
          showSpeed: true,
          showETA: true
        });

        expect(typeof fileProgress.update).toBe('function');
        expect(typeof fileProgress.complete).toBe('function');

        fileProgress.update(250);
        fileProgress.update(250);
        fileProgress.complete();
      });
    });

    describe('Utility Methods', () => {
      it('should format task status correctly', () => {
        expect(progressTracker.formatTaskStatus('pending')).toContain('Pending');
        expect(progressTracker.formatTaskStatus('completed')).toContain('Completed');
        expect(progressTracker.formatTaskStatus('failed')).toContain('Failed');
      });

      it('should stop all progress bars', () => {
        progressTracker.createProgress({ total: 100 });
        progressTracker.createProgress({ total: 50 });
        
        expect(progressTracker.getActiveCount()).toBe(2);
        
        progressTracker.stopAll();
        
        expect(progressTracker.getActiveCount()).toBe(0);
      });
    });
  });

  describe('CLIConfig', () => {
    let cliConfig;
    const testConfigDir = '/tmp/test-model-mgmt-config';

    beforeEach(() => {
      // Mock fs operations
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(false);
      jest.spyOn(require('fs'), 'mkdirSync').mockImplementation();
      jest.spyOn(require('fs'), 'readFileSync').mockReturnValue('{}');
      jest.spyOn(require('fs'), 'writeFileSync').mockImplementation();

      cliConfig = new CLIConfig({ configDir: testConfigDir });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('Initialization', () => {
      it('should initialize with default configuration', () => {
        expect(cliConfig.config).toBeDefined();
        expect(cliConfig.config.display).toBeDefined();
        expect(cliConfig.config.logging).toBeDefined();
        expect(cliConfig.config.operations).toBeDefined();
      });

      it('should create configuration directory', () => {
        expect(require('fs').mkdirSync).toHaveBeenCalledWith(
          testConfigDir,
          { recursive: true }
        );
      });
    });

    describe('Configuration Management', () => {
      it('should get configuration values', () => {
        const logLevel = cliConfig.get('logging.level');
        expect(logLevel).toBe('info');

        const defaultValue = cliConfig.get('nonexistent.key', 'default');
        expect(defaultValue).toBe('default');
      });

      it('should set configuration values', () => {
        cliConfig.set('logging.level', 'debug', false);
        expect(cliConfig.get('logging.level')).toBe('debug');
      });

      it('should update configuration with object', () => {
        const updates = {
          operations: {
            defaultParallelism: 5
          }
        };

        cliConfig.update(updates, false);
        expect(cliConfig.get('operations.defaultParallelism')).toBe(5);
      });

      it('should reset configuration to defaults', () => {
        cliConfig.set('logging.level', 'debug', false);
        cliConfig.reset(false);
        expect(cliConfig.get('logging.level')).toBe('info');
      });
    });

    describe('History Management', () => {
      it('should add commands to history', () => {
        cliConfig.addToHistory('sync --provider openai', {
          success: true,
          duration: 1500
        });

        const history = cliConfig.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].command).toBe('sync --provider openai');
        expect(history[0].success).toBe(true);
      });

      it('should limit history size', () => {
        const originalHistorySize = cliConfig.get('interactive.historySize');
        cliConfig.set('interactive.historySize', 2, false);

        cliConfig.addToHistory('command1');
        cliConfig.addToHistory('command2');
        cliConfig.addToHistory('command3');

        const history = cliConfig.getHistory();
        expect(history).toHaveLength(2);
        expect(history[0].command).toBe('command2');
        expect(history[1].command).toBe('command3');

        cliConfig.set('interactive.historySize', originalHistorySize, false);
      });

      it('should get frequent commands', () => {
        cliConfig.addToHistory('sync --provider openai');
        cliConfig.addToHistory('health');
        cliConfig.addToHistory('sync --provider anthropic');
        cliConfig.addToHistory('sync --provider openai');

        const frequent = cliConfig.getFrequentCommands(2);
        expect(frequent).toHaveLength(2);
        expect(frequent[0].command).toBe('sync');
        expect(frequent[0].count).toBe(2);
        expect(frequent[1].command).toBe('health');
        expect(frequent[1].count).toBe(1);
      });

      it('should clear history', () => {
        cliConfig.addToHistory('test command');
        expect(cliConfig.getHistory()).toHaveLength(1);

        cliConfig.clearHistory();
        expect(cliConfig.getHistory()).toHaveLength(0);
      });
    });

    describe('Environment Variables', () => {
      it('should parse environment values correctly', () => {
        expect(cliConfig.parseEnvValue('true')).toBe(true);
        expect(cliConfig.parseEnvValue('false')).toBe(false);
        expect(cliConfig.parseEnvValue('123')).toBe(123);
        expect(cliConfig.parseEnvValue('123.45')).toBe(123.45);
        expect(cliConfig.parseEnvValue('string')).toBe('string');
      });
    });

    describe('Validation', () => {
      it('should validate configuration successfully', () => {
        const validation = cliConfig.validate();
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      });

      it('should detect validation errors', () => {
        cliConfig.set('api.baseUrl', 'invalid-url', false);
        const validation = cliConfig.validate();
        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      });

      it('should detect validation warnings', () => {
        cliConfig.set('operations.defaultParallelism', 50, false);
        const validation = cliConfig.validate();
        expect(validation.warnings.length).toBeGreaterThan(0);
      });
    });
  });

  describe('OutputFormatter', () => {
    let formatter;

    beforeEach(() => {
      formatter = new OutputFormatter();
    });

    describe('Text Formatting', () => {
      it('should format titles with decoration', () => {
        const title = formatter.title('Test Title');
        expect(title).toContain('Test Title');
      });

      it('should format headers with underlines', () => {
        const header = formatter.header('Test Header');
        expect(header).toContain('Test Header');
      });

      it('should format lists with bullets', () => {
        const items = ['Item 1', 'Item 2', 'Item 3'];
        const list = formatter.list(items);
        expect(list).toContain('Item 1');
        expect(list).toContain('Item 2');
        expect(list).toContain('Item 3');
      });

      it('should format key-value pairs', () => {
        const data = { key1: 'value1', key2: 'value2' };
        const formatted = formatter.keyValue(data);
        expect(formatted).toContain('key1');
        expect(formatted).toContain('value1');
      });
    });

    describe('Value Formatting', () => {
      it('should format different value types', () => {
        expect(formatter.formatValue(null)).toContain('null');
        expect(formatter.formatValue(true)).toContain('true');
        expect(formatter.formatValue(false)).toContain('false');
        expect(formatter.formatValue(123)).toContain('123');
        expect(formatter.formatValue(new Date())).toBeTruthy();
        expect(formatter.formatValue([1, 2, 3])).toContain('3 items');
        expect(formatter.formatValue({ a: 1 })).toContain('object');
      });
    });

    describe('Utility Formatting', () => {
      it('should format file sizes', () => {
        expect(formatter.fileSize(0)).toBe('0 B');
        expect(formatter.fileSize(1024)).toBe('1 KB');
        expect(formatter.fileSize(1048576)).toBe('1 MB');
      });

      it('should format durations', () => {
        expect(formatter.duration(500)).toContain('ms');
        expect(formatter.duration(1500)).toContain('s');
        expect(formatter.duration(65000)).toContain('m');
        expect(formatter.duration(3665000)).toContain('h');
      });

      it('should format percentages', () => {
        const percentage = formatter.percentage(75.5);
        expect(percentage).toContain('75.5');
        expect(percentage).toContain('%');
      });

      it('should create progress bars', () => {
        const progressBar = formatter.progressBar(50, 100);
        expect(progressBar).toContain('[');
        expect(progressBar).toContain(']');
        expect(progressBar).toContain('50.0%');
      });
    });

    describe('Table Creation', () => {
      it('should create formatted tables', () => {
        const data = [
          ['Row 1 Col 1', 'Row 1 Col 2'],
          ['Row 2 Col 1', 'Row 2 Col 2']
        ];
        
        const table = formatter.table(data, {
          headers: ['Column 1', 'Column 2']
        });
        
        expect(table).toBeDefined();
      });
    });

    describe('JSON Formatting', () => {
      it('should format JSON with syntax highlighting', () => {
        const data = { key: 'value', number: 123, boolean: true };
        const json = formatter.json(data);
        expect(json).toContain('key');
        expect(json).toContain('value');
        expect(json).toContain('123');
        expect(json).toContain('true');
      });
    });

    describe('Status Messages', () => {
      it('should format status messages with icons', () => {
        expect(formatter.status('success', 'Operation completed')).toContain('✅');
        expect(formatter.status('error', 'Operation failed')).toContain('❌');
        expect(formatter.status('warning', 'Warning message')).toContain('⚠️');
        expect(formatter.status('info', 'Information')).toContain('ℹ️');
      });
    });

    describe('Text Utilities', () => {
      it('should wrap text correctly', () => {
        const longText = 'This is a very long text that should be wrapped at a specific width';
        const wrapped = formatter.wrap(longText, { width: 20 });
        expect(wrapped).toContain('\n');
      });

      it('should create separators', () => {
        const separator = formatter.separator({ length: 10 });
        expect(separator).toHaveLength(10);
      });
    });

    describe('Metrics to CSV', () => {
      it('should convert metrics to CSV format', () => {
        const metrics = {
          timestamp: Date.now(),
          metrics: {
            'test_counter': {
              name: 'test_counter',
              type: 'counter',
              value: 42,
              tags: { env: 'test' }
            }
          }
        };

        const csv = formatter.metricsToCSV(metrics);
        expect(csv).toContain('timestamp,metric,type,value,tags');
        expect(csv).toContain('test_counter');
        expect(csv).toContain('counter');
        expect(csv).toContain('42');
      });
    });
  });

  describe('Integration Tests', () => {
    it('should integrate CLI components correctly', () => {
      const mockMonitoring = {
        getLogger: jest.fn(() => ({
          info: jest.fn(),
          error: jest.fn(),
          generateCorrelationId: jest.fn(() => 'test-123')
        })),
        getMetrics: jest.fn(() => ({
          startTimer: jest.fn(),
          endTimer: jest.fn(),
          increment: jest.fn()
        }))
      };

      const cli = new ModelManagementCLI({
        monitoring: mockMonitoring,
        version: '1.0.0'
      });

      expect(cli.config).toBeInstanceOf(CLIConfig);
      expect(cli.formatter).toBeInstanceOf(OutputFormatter);
      expect(cli.progressTracker).toBeInstanceOf(ProgressTracker);
    });

    it('should handle CLI workflow end-to-end', async () => {
      const mockMonitoring = {
        getLogger: jest.fn(() => ({
          info: jest.fn(),
          error: jest.fn(),
          generateCorrelationId: jest.fn(() => 'test-123')
        })),
        getMetrics: jest.fn(() => ({
          startTimer: jest.fn(() => 'timer-123'),
          endTimer: jest.fn(),
          increment: jest.fn(),
          getMetrics: jest.fn(() => ({ timestamp: Date.now(), metrics: {} }))
        })),
        performHealthCheck: jest.fn(() => Promise.resolve({
          status: 'healthy',
          checks: {}
        }))
      };

      const cli = new ModelManagementCLI({
        monitoring: mockMonitoring,
        version: '1.0.0'
      });

      // Mock database
      const db = require('../../../../database');
      db.models.Provider.findAll.mockResolvedValue([]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation();

      // Test sync with no providers
      await cli.executeSync({ provider: ['test'] }, {});

      expect(exitSpy).toHaveBeenCalledWith(1);

      consoleSpy.restore();
      exitSpy.restore();
    });
  });
});