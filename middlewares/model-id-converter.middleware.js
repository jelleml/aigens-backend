// Middleware to convert numeric model IDs to slugs for backward compatibility
const db = require('../database');

const convertModelIdToSlug = async (req, res, next) => {
    try {
        const { id_model } = req.body;

        // Check if id_model is a numeric string (old format)
        if (id_model && /^\d+$/.test(id_model)) {
            console.log(`Converting numeric model ID ${id_model} to slug...`);

            await db.initialize();
            const Model = db.models.Model;
            const model = await Model.findByPk(parseInt(id_model));

            if (model) {
                req.body.id_model = model.model_slug;
                console.log(`Converted model ID ${id_model} to slug: ${model.model_slug}`);
            } else {
                return res.status(400).json({
                    error: {
                        type: 'validation_error',
                        message: `Model with ID ${id_model} not found`,
                        code: 'MODEL_NOT_FOUND'
                    }
                });
            }
        }

        next();
    } catch (error) {
        console.error('Error converting model ID to slug:', error);
        return res.status(500).json({
            error: {
                type: 'internal_error',
                message: 'Failed to convert model ID',
                code: 'MODEL_CONVERSION_ERROR'
            }
        });
    }
};

module.exports = convertModelIdToSlug;
