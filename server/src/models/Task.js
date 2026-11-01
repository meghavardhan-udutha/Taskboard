import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

const timeLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  minutes: { type: Number, required: true, min: 1 },
  note: { type: String, trim: true, maxlength: 200, default: '' },
  loggedAt: { type: Date, default: Date.now },
});

const linkSchema = new mongoose.Schema({
  kind: { type: String, enum: ['github', 'drive', 'other'], default: 'other' },
  title: { type: String, trim: true, maxlength: 200, default: '' },
  url: { type: String, required: true, trim: true, maxlength: 500 },
  state: { type: String, default: '' },
});

const taskSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    list: { type: mongoose.Schema.Types.ObjectId, required: true },
    number: { type: Number, default: 0 },
    position: { type: Number, default: 0 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    labels: [{ type: String, trim: true, maxlength: 30 }],
    dueDate: { type: Date, default: null },
    estimateMinutes: { type: Number, default: 0, min: 0 },
    blockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    links: [linkSchema],
    reopenCount: { type: Number, default: 0 },
    source: { type: String, enum: ['web', 'nlp', 'email', 'api', 'github', 'demo'], default: 'web' },
    comments: [commentSchema],
    timeLogs: [timeLogSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Task', taskSchema);
