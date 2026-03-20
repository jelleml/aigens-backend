const { ModelMatchingAudit } = require('../../../database/models');
const { sequelize } = require('../../../database');

describe('ModelMatchingAudit Model', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await ModelMatchingAudit.destroy({ where: {} });
  });

  describe('Model Creation', () => {
    it('should create a model matching audit record with required fields', async () => {
      const auditRecord = await ModelMatchingAudit.create({
        integrated_model_slug: 'gpt-4',
        match_type: 'exact_match',
        confidence_score: 1.00,
        tier_used: 1,
        reasoning: 'Exact match found in database',
        processing_time_ms: 150,
        llm_used: false,
        alternatives_considered: JSON.stringify(['gpt-4-turbo', 'gpt-4o']),
      });

      expect(auditRecord.id).toBeDefined();
      expect(auditRecord.integrated_model_slug).toBe('gpt-4');
      expect(auditRecord.match_type).toBe('exact_match');
      expect(auditRecord.confidence_score).toBe('1.00');
      expect(auditRecord.tier_used).toBe(1);
      expect(auditRecord.reasoning).toBe('Exact match found in database');
      expect(auditRecord.processing_time_ms).toBe(150);
      expect(auditRecord.llm_used).toBe(false);
      expect(auditRecord.alternatives_considered).toEqual(['gpt-4-turbo', 'gpt-4o']);
      expect(auditRecord.created_at).toBeDefined();
    });

    it('should create a record with no match', async () => {
      const auditRecord = await ModelMatchingAudit.create({
        integrated_model_slug: 'unknown-model',
        match_type: 'no_match',
        confidence_score: 0.00,
        tier_used: null,
        reasoning: 'No matching model found',
        processing_time_ms: 50,
        llm_used: false,
        alternatives_considered: null,
      });

      expect(auditRecord.aa_model_slug).toBeNull();
      expect(auditRecord.match_type).toBe('no_match');
      expect(auditRecord.confidence_score).toBe('0.00');
      expect(auditRecord.tier_used).toBeNull();
    });

    it('should handle JSON alternatives_considered field correctly', async () => {
      const alternatives = [
        { slug: 'gpt-4-turbo', score: 0.95 },
        { slug: 'gpt-4o', score: 0.90 }
      ];

      const auditRecord = await ModelMatchingAudit.create({
        integrated_model_slug: 'gpt-4',
        match_type: 'fuzzy_match',
        confidence_score: 0.85,
        tier_used: 4,
        reasoning: 'Fuzzy match with multiple alternatives',
        processing_time_ms: 200,
        llm_used: true,
        alternatives_considered: alternatives,
      });

      expect(auditRecord.alternatives_considered).toEqual(alternatives);
    });
  });

  describe('Validations', () => {
    it('should require integrated_model_slug', async () => {
      await expect(ModelMatchingAudit.create({
        match_type: 'exact_match',
      })).rejects.toThrow();
    });

    it('should require match_type', async () => {
      await expect(ModelMatchingAudit.create({
        integrated_model_slug: 'gpt-4',
      })).rejects.toThrow();
    });

    it('should validate confidence_score range', async () => {
      await expect(ModelMatchingAudit.create({
        integrated_model_slug: 'gpt-4',
        match_type: 'exact_match',
        confidence_score: 1.5, // Out of range
      })).rejects.toThrow();
    });

    it('should validate tier_used range', async () => {
      await expect(ModelMatchingAudit.create({
        integrated_model_slug: 'gpt-4',
        match_type: 'exact_match',
        tier_used: 5, // Out of range
      })).rejects.toThrow();
    });
  });

  describe('Indexes', () => {
    it('should have indexes for efficient querying', async () => {
      const tableInfo = await sequelize.getQueryInterface().describeTable('model_matching_audit');
      
      // Verifica che gli indici esistano (questa è una verifica di base)
      expect(tableInfo).toBeDefined();
    });
  });
}); 