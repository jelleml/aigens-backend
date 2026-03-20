const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class ModelMatchingAudit extends Model {
        static associate(models) {
            // Associazione con il modello Model se necessario
            // ModelMatchingAudit.belongsTo(models.Model, { foreignKey: 'aa_model_slug', targetKey: 'slug' });
        }
    }

    ModelMatchingAudit.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        integrated_model_slug: {
            type: DataTypes.STRING(255),
            allowNull: false,
            comment: 'The integrated model slug that was being matched',
        },
        aa_model_slug: {
            type: DataTypes.STRING(255),
            allowNull: true,
            comment: 'The AA model slug that was matched (NULL if no match)',
        },
        match_type: {
            type: DataTypes.ENUM('exact_match', 'same_family', 'llm_assisted', 'fuzzy_match', 'no_match'),
            allowNull: false,
            comment: 'Type of match found',
        },
        confidence_score: {
            type: DataTypes.DECIMAL(3, 2),
            allowNull: true,
            comment: 'Confidence score of the match (0.00-1.00)',
            validate: {
                min: 0.00,
                max: 1.00,
            },
        },
        tier_used: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Matching tier used (1=exact, 2=family, 3=llm, 4=fuzzy)',
            validate: {
                min: 1,
                max: 4,
            },
        },
        reasoning: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Detailed explanation of the matching decision',
        },
        processing_time_ms: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Time taken to process this match in milliseconds',
            validate: {
                min: 0,
            },
        },
        llm_used: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: 'Whether LLM assistance was used for this match',
        },
        alternatives_considered: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'JSON array of alternative matches that were considered',
            get() {
                const rawValue = this.getDataValue('alternatives_considered');
                return rawValue ? JSON.parse(rawValue) : null;
            },
            set(value) {
                this.setDataValue('alternatives_considered', value ? JSON.stringify(value) : null);
            },
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            comment: 'When this audit record was created',
        },
    }, {
        sequelize,
        modelName: 'ModelMatchingAudit',
        tableName: 'model_matching_audit',
        timestamps: false, // Usiamo solo created_at
        underscored: true,
        indexes: [
            {
                name: 'idx_audit_integrated_model',
                fields: ['integrated_model_slug'],
            },
            {
                name: 'idx_audit_aa_model',
                fields: ['aa_model_slug'],
            },
            {
                name: 'idx_audit_match_type',
                fields: ['match_type'],
            },
            {
                name: 'idx_audit_confidence',
                fields: ['confidence_score'],
            },
            {
                name: 'idx_audit_tier',
                fields: ['tier_used'],
            },
            {
                name: 'idx_audit_created_at',
                fields: ['created_at'],
            },
            {
                name: 'idx_audit_llm_used',
                fields: ['llm_used'],
            },
        ],
    });

    return ModelMatchingAudit;
}; 