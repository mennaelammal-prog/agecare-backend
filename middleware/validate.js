const Joi = require('joi');

const schemas = {
  checkin: Joi.object({
    mood: Joi.number().integer().min(1).max(5).required(),
    energy: Joi.number().integer().min(1).max(5).required(),
    pain: Joi.number().integer().min(0).max(10).required(),
    sleep_hours: Joi.number().min(0).max(24).optional(),
    notes: Joi.string().max(2000).optional(),
  }),

  familyContact: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    relationship: Joi.string().min(1).max(50).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    notify_email: Joi.boolean().default(true),
    notify_sms: Joi.boolean().default(false),
  }),

  chat: Joi.object({
    message: Joi.string().min(1).max(4000).required(),
    history: Joi.array().items(
      Joi.object({
        role: Joi.string().valid('user', 'assistant').required(),
        content: Joi.string().required(),
      })
    ).optional(),
  }),
};

function validate(schemaName) {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) return next();

    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const messages = error.details.map(d => d.message).join(', ');
      return res.status(400).json({ error: 'Validation failed', details: messages });
    }

    req.body = value;
    next();
  };
}

module.exports = { validate };