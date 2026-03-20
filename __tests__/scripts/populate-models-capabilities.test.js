const { extractCapabilitiesFromArchitecture, mapModalityToCapability } = require('../../scripts/populate-models-capabilities');

// Mock the database module
jest.mock('../../database', () => ({
  models: {
    Model: {
      findOne: jest.fn()
    }
  }
}));

describe('Populate Models Capabilities Script', () => {
  describe('extractCapabilitiesFromArchitecture', () => {
    test('should extract capabilities from input and output modalities', () => {
      const architectureData = {
        input_modalities: ['text', 'image'],
        output_modalities: ['text']
      };
      
      const capabilities = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(capabilities).toContain('Text input');
      expect(capabilities).toContain('Image input');
      expect(capabilities).toContain('Text output');
      expect(capabilities).toContain('Text generation');
      expect(capabilities).toContain('Text completion');
    });
    
    test('should extract capabilities from modality string', () => {
      const architectureData = {
        modality: 'text+image->text'
      };
      
      const capabilities = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(capabilities).toContain('Text input');
      expect(capabilities).toContain('Image input');
      expect(capabilities).toContain('Text output');
      expect(capabilities).toContain('Text generation');
      expect(capabilities).toContain('Text completion');
    });
    
    test('should add reasoning capabilities for GPT tokenizer', () => {
      const architectureData = {
        input_modalities: ['text'],
        output_modalities: ['text'],
        tokenizer: 'GPT'
      };
      
      const capabilities = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(capabilities).toContain('Logical reasoning');
      expect(capabilities).toContain('Commonsense reasoning');
    });
    
    test('should add code capabilities for code-related models', () => {
      const architectureData = {
        input_modalities: ['text'],
        output_modalities: ['text'],
        model_name: 'DeepSeek Coder'
      };
      
      const capabilities = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(capabilities).toContain('Code generation');
      expect(capabilities).toContain('Code explanation');
    });
    
    test('should handle null or undefined architecture data', () => {
      expect(extractCapabilitiesFromArchitecture(null)).toEqual([
        'Text generation',
        'Text completion'
      ]);
      
      expect(extractCapabilitiesFromArchitecture(undefined)).toEqual([
        'Text generation',
        'Text completion'
      ]);
    });
  });
  
  describe('mapModalityToCapability', () => {
    test('should map text input modality correctly', () => {
      const result = mapModalityToCapability('text', 'input');
      
      expect(result).toEqual({
        name: 'Text input',
        type: 'input',
        description: 'Accettazione input testuale'
      });
    });
    
    test('should map image output modality correctly', () => {
      const result = mapModalityToCapability('image', 'output');
      
      expect(result).toEqual({
        name: 'Image output',
        type: 'output',
        description: 'Generazione output immagine'
      });
    });
    
    test('should normalize modality names', () => {
      const result = mapModalityToCapability('  TEXT  ', 'input');
      
      expect(result).toEqual({
        name: 'Text input',
        type: 'input',
        description: 'Accettazione input testuale'
      });
    });
    
    test('should return null for unknown modalities', () => {
      const result = mapModalityToCapability('unknown', 'input');
      
      expect(result).toBeNull();
    });
  });
});