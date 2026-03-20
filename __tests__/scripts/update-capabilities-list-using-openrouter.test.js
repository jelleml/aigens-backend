const {
  extractCapabilitiesFromArchitecture,
  mapModalityToCapability,
  mergeWithExistingCapabilities
} = require('../../scripts/update-capabilities-list-using-openrouter');

describe('OpenRouter Capabilities Update Script', () => {
  describe('extractCapabilitiesFromArchitecture', () => {
    test('should extract input and output modalities from architecture data', () => {
      const architectureData = {
        input_modalities: ['text', 'image'],
        output_modalities: ['text']
      };
      
      const result = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ modality: 'text', type: 'input' });
      expect(result).toContainEqual({ modality: 'image', type: 'input' });
      expect(result).toContainEqual({ modality: 'text', type: 'output' });
    });
    
    test('should handle missing modalities arrays', () => {
      const architectureData = {
        tokenizer: 'GPT'
      };
      
      const result = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(result).toHaveLength(0);
    });
    
    test('should parse modality string when arrays are not available', () => {
      const architectureData = {
        modality: 'text+image->text'
      };
      
      const result = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ modality: 'text', type: 'input' });
      expect(result).toContainEqual({ modality: 'image', type: 'input' });
      expect(result).toContainEqual({ modality: 'text', type: 'output' });
    });
    
    test('should handle null or undefined architecture data', () => {
      expect(extractCapabilitiesFromArchitecture(null)).toHaveLength(0);
      expect(extractCapabilitiesFromArchitecture(undefined)).toHaveLength(0);
    });

    test('should handle complex modality combinations', () => {
      const architectureData = {
        input_modalities: ['text', 'image', 'audio', 'video'],
        output_modalities: ['text', 'image', 'audio']
      };
      
      const result = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(result).toHaveLength(7);
      expect(result).toContainEqual({ modality: 'text', type: 'input' });
      expect(result).toContainEqual({ modality: 'image', type: 'input' });
      expect(result).toContainEqual({ modality: 'audio', type: 'input' });
      expect(result).toContainEqual({ modality: 'video', type: 'input' });
      expect(result).toContainEqual({ modality: 'text', type: 'output' });
      expect(result).toContainEqual({ modality: 'image', type: 'output' });
      expect(result).toContainEqual({ modality: 'audio', type: 'output' });
    });

    test('should parse complex modality string with multiple inputs and outputs', () => {
      const architectureData = {
        modality: 'text+image+audio->text+image'
      };
      
      const result = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(result).toHaveLength(5);
      expect(result).toContainEqual({ modality: 'text', type: 'input' });
      expect(result).toContainEqual({ modality: 'image', type: 'input' });
      expect(result).toContainEqual({ modality: 'audio', type: 'input' });
      expect(result).toContainEqual({ modality: 'text', type: 'output' });
      expect(result).toContainEqual({ modality: 'image', type: 'output' });
    });

    test('should handle malformed modality string gracefully', () => {
      const architectureData = {
        modality: 'text-image-audio'  // Missing arrow separator
      };
      
      const result = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(result).toHaveLength(0);
    });

    test('should prioritize structured modalities over modality string', () => {
      const architectureData = {
        input_modalities: ['text', 'code'],
        output_modalities: ['text'],
        modality: 'text+image->text+image' // This should be ignored
      };
      
      const result = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ modality: 'text', type: 'input' });
      expect(result).toContainEqual({ modality: 'code', type: 'input' });
      expect(result).toContainEqual({ modality: 'text', type: 'output' });
    });

    test('should handle empty arrays gracefully', () => {
      const architectureData = {
        input_modalities: [],
        output_modalities: []
      };
      
      const result = extractCapabilitiesFromArchitecture(architectureData);
      
      expect(result).toHaveLength(0);
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

    test('should map all supported input modality types', () => {
      const inputModalities = ['text', 'image', 'audio', 'video', 'file', 'code'];
      
      inputModalities.forEach(modality => {
        const result = mapModalityToCapability(modality, 'input');
        expect(result).not.toBeNull();
        expect(result.type).toBe('input');
        expect(result.name).toBe(`${modality.charAt(0).toUpperCase() + modality.slice(1)} input`);
      });
    });

    test('should map all supported output modality types', () => {
      const outputModalities = ['text', 'image', 'audio', 'video', 'code'];
      
      outputModalities.forEach(modality => {
        const result = mapModalityToCapability(modality, 'output');
        expect(result).not.toBeNull();
        expect(result.type).toBe('output');
        expect(result.name).toBe(`${modality.charAt(0).toUpperCase() + modality.slice(1)} output`);
      });
    });

    test('should handle case variations consistently', () => {
      const variations = ['text', 'Text', 'TEXT', 'tEXt'];
      
      variations.forEach(variation => {
        const result = mapModalityToCapability(variation, 'input');
        expect(result).toEqual({
          name: 'Text input',
          type: 'input',
          description: 'Accettazione input testuale'
        });
      });
    });

    test('should handle whitespace variations consistently', () => {
      const variations = ['text', ' text', 'text ', ' text '];
      
      variations.forEach(variation => {
        const result = mapModalityToCapability(variation, 'input');
        expect(result).toEqual({
          name: 'Text input',
          type: 'input',
          description: 'Accettazione input testuale'
        });
      });
    });

    test('should handle invalid type parameter', () => {
      const result = mapModalityToCapability('text', 'invalid_type');
      // The function defaults to output modalities when type is not 'input'
      expect(result).toEqual({
        name: 'Text output',
        type: 'output',
        description: 'Generazione output testuale'
      });
    });
  });
  
  describe('mergeWithExistingCapabilities', () => {
    test('should filter out capabilities that already exist', () => {
      const newCapabilities = [
        { name: 'Text input', type: 'input' },
        { name: 'Image input', type: 'input' },
        { name: 'Video input', type: 'input' }
      ];
      
      const existingCapabilities = [
        { name: 'Text input', type: 'input' },
        { name: 'Image input', type: 'input' }
      ];
      
      const result = mergeWithExistingCapabilities(newCapabilities, existingCapabilities);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Video input');
    });
    
    test('should return all capabilities when none exist', () => {
      const newCapabilities = [
        { name: 'Text input', type: 'input' },
        { name: 'Image input', type: 'input' }
      ];
      
      const existingCapabilities = [];
      
      const result = mergeWithExistingCapabilities(newCapabilities, existingCapabilities);
      
      expect(result).toHaveLength(2);
    });
    
    test('should return empty array when all capabilities already exist', () => {
      const newCapabilities = [
        { name: 'Text input', type: 'input' },
        { name: 'Image input', type: 'input' }
      ];
      
      const existingCapabilities = [
        { name: 'Text input', type: 'input' },
        { name: 'Image input', type: 'input' },
        { name: 'Video input', type: 'input' }
      ];
      
      const result = mergeWithExistingCapabilities(newCapabilities, existingCapabilities);
      
      expect(result).toHaveLength(0);
    });

    test('should handle duplicate capabilities in new capabilities array', () => {
      const newCapabilities = [
        { name: 'Text input', type: 'input' },
        { name: 'Image input', type: 'input' },
        { name: 'Text input', type: 'input' } // Duplicate
      ];
      
      const existingCapabilities = [
        { name: 'Video input', type: 'input' }
      ];
      
      const result = mergeWithExistingCapabilities(newCapabilities, existingCapabilities);
      
      expect(result).toHaveLength(2);
      expect(result.filter(cap => cap.name === 'Text input')).toHaveLength(1);
      expect(result.filter(cap => cap.name === 'Image input')).toHaveLength(1);
    });

    test('should handle case-sensitive capability names correctly', () => {
      const newCapabilities = [
        { name: 'Text input', type: 'input' },
        { name: 'text input', type: 'input' }, // Different case
        { name: 'IMAGE INPUT', type: 'input' }
      ];
      
      const existingCapabilities = [
        { name: 'Text input', type: 'input' }
      ];
      
      const result = mergeWithExistingCapabilities(newCapabilities, existingCapabilities);
      
      expect(result).toHaveLength(2);
      expect(result.filter(cap => cap.name.toLowerCase() === 'text input')).toHaveLength(1);
      expect(result.filter(cap => cap.name.toLowerCase() === 'image input')).toHaveLength(1);
    });

    test('should preserve all properties of capabilities', () => {
      const newCapabilities = [
        { 
          name: 'Text input', 
          type: 'input', 
          description: 'Text input description',
          additionalProperty: 'value'
        }
      ];
      
      const existingCapabilities = [];
      
      const result = mergeWithExistingCapabilities(newCapabilities, existingCapabilities);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'Text input', 
        type: 'input', 
        description: 'Text input description',
        additionalProperty: 'value'
      });
    });

    test('should handle empty arrays gracefully', () => {
      expect(mergeWithExistingCapabilities([], [])).toHaveLength(0);
      expect(mergeWithExistingCapabilities([], [{ name: 'Text input', type: 'input' }])).toHaveLength(0);
      expect(mergeWithExistingCapabilities([{ name: 'Text input', type: 'input' }], [])).toHaveLength(1);
    });
  });

  describe('Edge cases and error handling', () => {
    test('extractCapabilitiesFromArchitecture should handle malformed architecture data', () => {
      const malformedCases = [
        { input_modalities: 'not-an-array' },
        { output_modalities: 'not-an-array' },
        { input_modalities: [null, undefined, ''] },
        { modality: '' },
        { modality: '->' },
        { modality: 'text->' },
        { modality: '->text' },
        {}
      ];
      
      malformedCases.forEach(testCase => {
        expect(() => extractCapabilitiesFromArchitecture(testCase)).not.toThrow();
      });
    });

    test('mapModalityToCapability should handle edge cases gracefully', () => {
      const edgeCases = [
        { modality: '', type: 'input' },
        { modality: null, type: 'input' },
        { modality: undefined, type: 'input' },
        { modality: 'text', type: '' },
        { modality: 'text', type: null },
        { modality: 'text', type: undefined }
      ];
      
      edgeCases.forEach(({ modality, type }) => {
        expect(() => mapModalityToCapability(modality, type)).not.toThrow();
      });
    });

    test('mergeWithExistingCapabilities should handle invalid inputs gracefully', () => {
      const invalidCases = [
        { newCapabilities: null, existingCapabilities: [] },
        { newCapabilities: [], existingCapabilities: null },
        { newCapabilities: undefined, existingCapabilities: [] },
        { newCapabilities: [], existingCapabilities: undefined },
        { newCapabilities: [{ name: null }], existingCapabilities: [] },
        { newCapabilities: [], existingCapabilities: [{ name: null }] }
      ];
      
      invalidCases.forEach(({ newCapabilities, existingCapabilities }) => {
        expect(() => mergeWithExistingCapabilities(newCapabilities, existingCapabilities)).not.toThrow();
      });
    });
  });
});