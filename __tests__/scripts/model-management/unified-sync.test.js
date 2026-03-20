/**
 * Unit tests for unified-sync CLI
 */

const { parseArgs, validateOptions, CLI_CONFIG } = require('../../../scripts/model-management/unified-sync');
const { EXECUTION_MODES, EXECUTION_STRATEGIES } = require('../../../services/model-management/unified-model-manager');

describe('unified-sync CLI', () => {
  describe('parseArgs', () => {
    it('should parse basic command with default values', () => {
      const args = ['update'];
      const options = parseArgs(args);

      expect(options.mode).toBe(EXECUTION_MODES.UPDATE);
      expect(options.providers).toEqual([]);
      expect(options.strategy).toBe(EXECUTION_STRATEGIES.MIXED);
      expect(options.concurrency).toBe(3);
      expect(options.dryRun).toBe(false);
      expect(options.force).toBe(false);
    });

    it('should parse all execution modes', () => {
      expect(parseArgs(['init']).mode).toBe(EXECUTION_MODES.INIT);
      expect(parseArgs(['update']).mode).toBe(EXECUTION_MODES.UPDATE);
      expect(parseArgs(['sync']).mode).toBe(EXECUTION_MODES.SYNC);
      expect(parseArgs([]).mode).toBe(EXECUTION_MODES.UPDATE); // default
    });

    it('should parse provider list', () => {
      const args = ['update', '--providers', 'openai,anthropic,deepseek'];
      const options = parseArgs(args);

      expect(options.providers).toEqual(['openai', 'anthropic', 'deepseek']);
    });

    it('should parse provider list with spaces', () => {
      const args = ['update', '--providers', 'openai, anthropic, deepseek'];
      const options = parseArgs(args);

      expect(options.providers).toEqual(['openai', 'anthropic', 'deepseek']);
    });

    it('should parse strategy options', () => {
      expect(parseArgs(['--strategy', 'sequential']).strategy).toBe(EXECUTION_STRATEGIES.SEQUENTIAL);
      expect(parseArgs(['--strategy', 'parallel']).strategy).toBe(EXECUTION_STRATEGIES.PARALLEL);
      expect(parseArgs(['--strategy', 'mixed']).strategy).toBe(EXECUTION_STRATEGIES.MIXED);
    });

    it('should throw error for invalid strategy', () => {
      expect(() => parseArgs(['--strategy', 'invalid'])).toThrow('Invalid strategy: invalid');
    });

    it('should parse numeric options', () => {
      const args = [
        'update',
        '--concurrency', '5',
        '--timeout', '600000',
        '--batch-size', '25'
      ];
      const options = parseArgs(args);

      expect(options.concurrency).toBe(5);
      expect(options.timeout).toBe(600000);
      expect(options.batchSize).toBe(25);
    });

    it('should parse boolean flags', () => {
      const args = [
        'update',
        '--dry-run',
        '--force',
        '--skip-health-check'
      ];
      const options = parseArgs(args);

      expect(options.dryRun).toBe(true);
      expect(options.force).toBe(true);
      expect(options.skipHealthCheck).toBe(true);
    });

    it('should parse log level', () => {
      expect(parseArgs(['--log-level', 'debug']).logLevel).toBe('debug');
      expect(parseArgs(['--log-level', 'info']).logLevel).toBe('info');
      expect(parseArgs(['--log-level', 'warn']).logLevel).toBe('warn');
      expect(parseArgs(['--log-level', 'error']).logLevel).toBe('error');
    });

    it('should parse help and version flags', () => {
      expect(parseArgs(['--help']).help).toBe(true);
      expect(parseArgs(['-h']).help).toBe(true);
      expect(parseArgs(['--version']).version).toBe(true);
      expect(parseArgs(['-v']).version).toBe(true);
    });

    it('should ignore unknown arguments with warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const options = parseArgs(['update', 'unknown-arg']);
      
      expect(options.mode).toBe(EXECUTION_MODES.UPDATE);
      expect(consoleSpy).toHaveBeenCalledWith('Warning: Unknown argument ignored: unknown-arg');
      
      consoleSpy.mockRestore();
    });

    it('should handle complex argument combinations', () => {
      const args = [
        'sync',
        '--providers', 'openai,anthropic',
        '--strategy', 'parallel',
        '--concurrency', '4',
        '--timeout', '300000',
        '--batch-size', '20',
        '--dry-run',
        '--force',
        '--log-level', 'debug'
      ];
      
      const options = parseArgs(args);

      expect(options).toEqual({
        mode: EXECUTION_MODES.SYNC,
        providers: ['openai', 'anthropic'],
        strategy: EXECUTION_STRATEGIES.PARALLEL,
        concurrency: 4,
        timeout: 300000,
        batchSize: 20,
        dryRun: true,
        force: true,
        skipHealthCheck: false,
        logLevel: 'debug',
        help: false,
        version: false
      });
    });
  });

  describe('validateOptions', () => {
    it('should validate valid options', () => {
      const validOptions = {
        concurrency: 3,
        timeout: 300000,
        batchSize: 50,
        providers: ['openai', 'anthropic']
      };

      expect(() => validateOptions(validOptions)).not.toThrow();
    });

    it('should throw error for invalid concurrency', () => {
      expect(() => validateOptions({ concurrency: 0, timeout: 300000, batchSize: 50, providers: [] }))
        .toThrow('Concurrency must be between 1 and 10');
      
      expect(() => validateOptions({ concurrency: 11, timeout: 300000, batchSize: 50, providers: [] }))
        .toThrow('Concurrency must be between 1 and 10');
    });

    it('should throw error for invalid timeout', () => {
      expect(() => validateOptions({ concurrency: 3, timeout: 5000, batchSize: 50, providers: [] }))
        .toThrow('Timeout must be between 10 seconds and 30 minutes');
      
      expect(() => validateOptions({ concurrency: 3, timeout: 2000000, batchSize: 50, providers: [] }))
        .toThrow('Timeout must be between 10 seconds and 30 minutes');
    });

    it('should throw error for invalid batch size', () => {
      expect(() => validateOptions({ concurrency: 3, timeout: 300000, batchSize: 0, providers: [] }))
        .toThrow('Batch size must be between 1 and 1000');
      
      expect(() => validateOptions({ concurrency: 3, timeout: 300000, batchSize: 1001, providers: [] }))
        .toThrow('Batch size must be between 1 and 1000');
    });

    it('should throw error for invalid provider names', () => {
      expect(() => validateOptions({ 
        concurrency: 3, 
        timeout: 300000, 
        batchSize: 50, 
        providers: ['invalid-provider'] 
      })).toThrow('Invalid provider: invalid-provider');
    });

    it('should accept valid provider names', () => {
      const validProviders = ['openai', 'anthropic', 'deepseek', 'ideogram', 'together', 'openrouter'];
      
      expect(() => validateOptions({ 
        concurrency: 3, 
        timeout: 300000, 
        batchSize: 50, 
        providers: validProviders 
      })).not.toThrow();
    });

    it('should validate multiple invalid options and throw first error', () => {
      expect(() => validateOptions({ 
        concurrency: 0, 
        timeout: 5000, 
        batchSize: 0, 
        providers: ['invalid'] 
      })).toThrow('Concurrency must be between 1 and 10');
    });
  });

  describe('CLI_CONFIG', () => {
    it('should have correct configuration', () => {
      expect(CLI_CONFIG.name).toBe('unified-sync');
      expect(CLI_CONFIG.version).toBe('1.0.0');
      expect(CLI_CONFIG.description).toBe('Unified AI Model Management System');
    });
  });

  describe('argument parsing edge cases', () => {
    it('should handle empty arguments array', () => {
      const options = parseArgs([]);
      
      expect(options.mode).toBe(EXECUTION_MODES.UPDATE);
      expect(options.providers).toEqual([]);
    });

    it('should handle arguments without values', () => {
      // These should be ignored or use defaults
      const options = parseArgs(['update', '--providers', '--strategy']);
      
      expect(options.mode).toBe(EXECUTION_MODES.UPDATE);
      expect(options.providers).toEqual([]); // No value provided
      expect(options.strategy).toBe(EXECUTION_STRATEGIES.MIXED); // Default value
    });

    it('should handle arguments at end of array', () => {
      const options = parseArgs(['update', '--dry-run']);
      
      expect(options.mode).toBe(EXECUTION_MODES.UPDATE);
      expect(options.dryRun).toBe(true);
    });

    it('should handle mixed position of mode argument', () => {
      expect(parseArgs(['--dry-run', 'init', '--force']).mode).toBe(EXECUTION_MODES.INIT);
      expect(parseArgs(['--providers', 'openai', 'sync']).mode).toBe(EXECUTION_MODES.SYNC);
    });

    it('should handle repeated arguments (last one wins)', () => {
      const options = parseArgs([
        'update',
        '--concurrency', '3',
        '--concurrency', '5',
        '--strategy', 'sequential',
        '--strategy', 'parallel'
      ]);

      expect(options.concurrency).toBe(5);
      expect(options.strategy).toBe(EXECUTION_STRATEGIES.PARALLEL);
    });

    it('should handle case sensitivity', () => {
      // Arguments should be case sensitive
      expect(() => parseArgs(['--PROVIDERS', 'openai'])).not.toThrow();
      // But the value should not affect parsing
      const options = parseArgs(['UPDATE']); // Wrong case for mode
      expect(options.mode).toBe(EXECUTION_MODES.UPDATE); // Should use default
    });
  });

  describe('integration scenarios', () => {
    it('should parse typical development command', () => {
      const args = [
        'update',
        '--providers', 'openai,anthropic',
        '--dry-run',
        '--log-level', 'debug'
      ];
      
      const options = parseArgs(args);

      expect(options).toMatchObject({
        mode: EXECUTION_MODES.UPDATE,
        providers: ['openai', 'anthropic'],
        dryRun: true,
        logLevel: 'debug',
        strategy: EXECUTION_STRATEGIES.MIXED,
        concurrency: 3
      });

      expect(() => validateOptions(options)).not.toThrow();
    });

    it('should parse typical production command', () => {
      const args = [
        'sync',
        '--strategy', 'mixed',
        '--concurrency', '2',
        '--timeout', '600000',
        '--batch-size', '25'
      ];
      
      const options = parseArgs(args);

      expect(options).toMatchObject({
        mode: EXECUTION_MODES.SYNC,
        strategy: EXECUTION_STRATEGIES.MIXED,
        concurrency: 2,
        timeout: 600000,
        batchSize: 25,
        dryRun: false,
        force: false
      });

      expect(() => validateOptions(options)).not.toThrow();
    });

    it('should parse emergency recovery command', () => {
      const args = [
        'init',
        '--force',
        '--skip-health-check',
        '--concurrency', '1',
        '--log-level', 'error'
      ];
      
      const options = parseArgs(args);

      expect(options).toMatchObject({
        mode: EXECUTION_MODES.INIT,
        force: true,
        skipHealthCheck: true,
        concurrency: 1,
        logLevel: 'error'
      });

      expect(() => validateOptions(options)).not.toThrow();
    });

    it('should parse testing command', () => {
      const args = [
        'sync',
        '--providers', 'openai',
        '--dry-run',
        '--strategy', 'sequential',
        '--timeout', '60000',
        '--batch-size', '5'
      ];
      
      const options = parseArgs(args);

      expect(options).toMatchObject({
        mode: EXECUTION_MODES.SYNC,
        providers: ['openai'],
        dryRun: true,
        strategy: EXECUTION_STRATEGIES.SEQUENTIAL,
        timeout: 60000,
        batchSize: 5
      });

      expect(() => validateOptions(options)).not.toThrow();
    });
  });
});