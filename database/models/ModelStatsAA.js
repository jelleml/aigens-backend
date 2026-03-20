const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModelStatsAA = sequelize.define('ModelStatsAA', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false
    },
    release_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    model_creator_slug: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Intelligence metrics
    intelligence_artificial_analysis_intelligence_index: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    intelligence_artificial_analysis_coding_index: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    intelligence_artificial_analysis_math_index: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    intelligence_mmlu_pro: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    intelligence_gpqa: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    intelligence_hle: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    intelligence_livecodebench: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    intelligence_scicode: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    intelligence_math_500: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    intelligence_aime: {
      type: DataTypes.FLOAT,
      allowNull: true
    },

    // Price metrics
    price_1m_blended_3_to_1: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    price_1m_input_tokens: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    price_1m_output_tokens: {
      type: DataTypes.FLOAT,
      allowNull: true
    },

    // Speed metrics
    speed_median_output_tokens_per_second: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    speed_median_time_to_first_token_seconds: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    speed_median_time_to_first_answer_token: {
      type: DataTypes.FLOAT,
      allowNull: true
    },

    // Score metrics
    score_speed: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    score_cost_per_1k_tokens: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    score_intelligence: {
      type: DataTypes.FLOAT,
      allowNull: true
    }
  }, {
    tableName: 'models_stats_aa',
    timestamps: true,
    underscored: true
  });

  ModelStatsAA.associate = (models) => {
    // Nuova associazione molti-a-molti con Model
    ModelStatsAA.belongsToMany(models.Model, {
      through: models.ModelModelStatsAA,
      foreignKey: 'id_model_aa',
      otherKey: 'id_model',
      as: 'models'
    });
  };

  return ModelStatsAA;
}; 