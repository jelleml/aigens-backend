const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Lead extends Model {
    static associate(models) {
      // Associazioni con altri modelli
      Lead.belongsTo(models.User, { foreignKey: 'user_id', as: 'user', allowNull: true });
    }

    // Getter per modelsInterest
    getModelsInterest() {
      const rawValue = this.getDataValue('models_interest');
      if (!rawValue) return [];

      try {
        return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
      } catch (error) {
        console.error('Errore nel parsing dei modelli di interesse:', error);
        return [];
      }
    }

    // Setter per modelsInterest
    setModelsInterest(value) {
      if (value === null || value === undefined) {
        this.setDataValue('models_interest', null);
        return;
      }

      // Se è già una stringa, la usiamo direttamente
      if (typeof value === 'string') {
        this.setDataValue('models_interest', value);
      } else {
        // Altrimenti convertiamo l'oggetto in stringa JSON
        this.setDataValue('models_interest', JSON.stringify(value));
      }
    }
  }

  Lead.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true
      },
      comment: 'Email del lead'
    },
    models_interest: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Array di modelli di interesse con nome, id, piano e tempo di utilizzo',
      get() {
        return this.getModelsInterest();
      },
      set(value) {
        this.setModelsInterest(value);
      },
      validate: {
        isValidModelsInterest(value) {
          const models = this.getModelsInterest();
          if (!Array.isArray(models) || models.length < 1) {
            throw new Error('Deve essere specificato almeno un modello di interesse');
          }

          models.forEach(model => {
            if (!model.model_id || !model.name || !model.usage_plan || !model.usage_time) {
              throw new Error('Ogni modello deve avere id, nome, piano di utilizzo e tempo di utilizzo');
            }
          });
        }
      }
    },
    estimated_savings: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Risparmio stimato in valuta'
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'EUR',
      comment: 'Valuta del risparmio stimato'
    },
    status: {
      type: DataTypes.ENUM('new', 'contacted', 'qualified', 'converted', 'lost'),
      allowNull: false,
      defaultValue: 'new',
      comment: 'Stato del lead nel processo di conversione'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Note sul lead'
    },
    contact_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Numero di tentativi di contatto'
    },
    last_contact_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Data dell\'ultimo contatto'
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Fonte di acquisizione del lead'
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'ID dell\'utente se il lead è stato convertito'
    },
    conversion_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Data di conversione del lead in utente'
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
    modelName: 'Lead',
    tableName: 'leads',
    timestamps: true,
    underscored: true
  });

  return Lead;
}; 