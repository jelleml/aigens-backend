const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModelPriceScore = sequelize.define('ModelPriceScore', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_model: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'models',
        key: 'id'
      },
      comment: 'ID del modello nella tabella models'
    },
    price_1m_input_tokens: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Prezzo per milione di token di input'
    },
    price_1m_output_tokens: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Prezzo per milione di token di output'
    },
    price_image: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Prezzo per interazione di generazione immagine (JSON format for operation-specific pricing)'
    },
    price_video: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Prezzo per interazione di generazione video (JSON format for operation-specific pricing)'
    },
    score_cost_per_1k_tokens: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Punteggio per costo per 1000 token'
    },
    score_cost_per_1k_tokens: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Punteggio per costo per 1000 token'
    },
    score_intelligence: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Punteggio di intelligenza del modello'
    },
    score_speed: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Punteggio di velocità del modello'
    },
    score_overall: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Punteggio complessivo del modello'
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Fonte dei dati (es. aa, manual, etc.)'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'models_price_score',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['id_model']
      },
      {
        fields: ['source']
      },
      {
        fields: ['id_model', 'source'],
        unique: true,
        name: 'unique_model_source'
      }
    ]
  });

  ModelPriceScore.associate = (models) => {
    ModelPriceScore.belongsTo(models.Model, {
      foreignKey: 'id_model',
      as: 'model'
    });
  };

  return ModelPriceScore;
};
