const { Model: SequelizeModel, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Model extends SequelizeModel {
    static associate(models) {
      // Associazioni con altri modelli
      Model.hasMany(models.MessageCost, { foreignKey: 'model_id' });
      
      // Nuova associazione molti-a-molti con ModelStatsAA
      Model.belongsToMany(models.ModelStatsAA, {
        through: models.ModelModelStatsAA,
        foreignKey: 'id_model',
        otherKey: 'id_model_aa',
        as: 'modelStatsAA'
      });

      // Un modello appartiene a un provider
      Model.belongsTo(models.Provider, {
        foreignKey: 'id_provider',
        as: 'provider'
      });

      // Un modello può avere molte ModelsSubscription
      if (models.ModelsSubscription) {
        Model.hasMany(models.ModelsSubscription, {
          foreignKey: 'id_model',
          as: 'modelSubscriptions'
        });
      }

      // Relazione con AggregatedModel (per modelli che sono endpoint aggregatori)
      if (models.AggregatedModel) {
        Model.hasMany(models.AggregatedModel, {
          foreignKey: 'id_model',
          as: 'aggregatedModelInfo'
        });
      }

      // Associazione molti-a-molti con ModelsCapability
      Model.belongsToMany(models.ModelsCapability, {
        through: models.ModelsModelsCapability,
        foreignKey: 'id_model',
        otherKey: 'id_capability',
        as: 'modelsCapabilities'
      });

      // Relazione con ModelPriceScore
      if (models.ModelPriceScore) {
        Model.hasMany(models.ModelPriceScore, {
          foreignKey: 'id_model',
          as: 'modelPriceScore'
        });
      }
    }

    // Getter per capabilities
    getCapabilities() {
      const rawValue = this.getDataValue('capabilities');
      if (!rawValue) return [];
      
      try {
        return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
      } catch (error) {
        console.error('Errore nel parsing delle capabilities:', error);
        return [];
      }
    }

    // Setter per capabilities
    setCapabilities(value) {
      if (value === null || value === undefined) {
        this.setDataValue('capabilities', null);
        return;
      }
      
      // Se è già una stringa, la usiamo direttamente
      if (typeof value === 'string') {
        this.setDataValue('capabilities', value);
      } else {
        // Altrimenti convertiamo l'oggetto in stringa JSON
        this.setDataValue('capabilities', JSON.stringify(value));
      }
    }
  }
  
  Model.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    model_slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'Identificativo univoco del modello con provider (es. claude-3-opus-anthropic)'
    },
    api_model_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'ID del modello come richiesto dall\'API del provider (es. claude-3-haiku-20240307)'
    },
    id_provider: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID del provider del modello AI'
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Nome completo del modello'
    },
    display_name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Nome + carino da visualizzare in front-end'
    },
    model_family: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Family or series the model belongs to (e.g., GPT-4, Claude 3, Llama, etc.)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Descrizione del modello'
    },
    max_tokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 16000,
      comment: 'Numero massimo di token supportati dal modello'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Indica se il modello è attualmente disponibile'
    },
    has_stats_aa: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Indica se il modello ha statistiche di aa associate'
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
    sequelize,
    modelName: 'Model',
    tableName: 'models',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['id_provider']
      },
      {
        fields: ['model_slug']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['model_family']
      }
    ]
  });
  
  return Model;
}; 