import Joi from 'joi';

export const leadSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/),
  company: Joi.string(),
  message: Joi.string(),
  branchId: Joi.string(),
  source: Joi.string(),
});

export const websiteFormSchema = Joi.object({
  publicKey: Joi.string().required(),
  name: Joi.string().trim().min(1).max(200).required(),
  email: Joi.string().email(),
  phone: Joi.string().trim().max(30),
  company: Joi.string().max(200),
  message: Joi.string().max(5000),
  pageUrl: Joi.string().uri().allow(''),
  utm_source: Joi.string().max(200),
  utm_medium: Joi.string().max(200),
  utm_campaign: Joi.string().max(200),
  captchaToken: Joi.string(),
  website_url: Joi.string().allow(''),
  company_website: Joi.string().allow(''),
})
  .or('email', 'phone')
  .unknown(true);

export const metaWebhookSchema = Joi.object({
  object: Joi.string(),
  entry: Joi.array().items(Joi.object({
    changes: Joi.array().items(Joi.object({
      value: Joi.object(),
    })),
  })),
});

export const whatsappWebhookSchema = Joi.object({
  object: Joi.string(),
  entry: Joi.array().items(Joi.object({
    changes: Joi.array().items(Joi.object({
      value: Joi.object({
        messages: Joi.array(),
      }),
    })),
  })),
});
