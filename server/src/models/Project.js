import mongoose from 'mongoose';

const listSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 60 },
  isDone: { type: Boolean, default: false },
});

const integrationsSchema = new mongoose.Schema(
  {
    slackWebhookUrl: { type: String, default: '' },
    discordWebhookUrl: { type: String, default: '' },
    webhookUrls: [{ type: String }],
    githubRepo: { type: String, default: '' },
    githubSecret: { type: String, default: '' },
    inboundEmailSecret: { type: String, default: '' },
    calendarToken: { type: String, default: '' },
    apiKeyHash: { type: String, default: '' },
    apiKeyPrefix: { type: String, default: '' },
    lastDelivery: {
      at: Date,
      ok: Boolean,
      target: String,
      error: String,
    },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lists: [listSchema],
    taskCounter: { type: Number, default: 0 },
    isSynthetic: { type: Boolean, default: false },
    integrations: { type: integrationsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.model('Project', projectSchema);
