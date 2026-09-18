import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  aiVerdict: { type: String },
  aiUrgency: { type: String },
  humanVerdict: { type: String, enum: ['confirmed', 'needs_verification', 'rejected'], required: true },
  humanUrgency: { type: String, enum: ['low', 'moderate', 'high', 'critical'] },
  tags: [{
    type: String,
    enum: [
      'false_positive',
      'missed_hazard',
      'severity_underestimated',
      'severity_overestimated',
      'scene_mismatch',
      'good_assessment',
      'unclear_photo',
    ],
  }],
  notes: { type: String, default: '' },
  configVersion: { type: Number, required: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true, bufferCommands: false, versionKey: false });

feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ configVersion: 1 });

export const Feedback = mongoose.model('Feedback', feedbackSchema);

export const FEEDBACK_DISCLAIMER =
  'Human feedback informs versioned prompt and deterministic rule adjustments. Model weights are not retrained live.';
