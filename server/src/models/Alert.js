import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  title: { type: String, required: true },
  severity: { type: String, enum: ['advisory', 'warning', 'danger'], required: true },
  source: { type: String, default: 'Kelani River Basin Hydrological Monitor' },
  trigger: {
    stationId: { type: String, required: true },
    stationName: { type: String, required: true },
    metric: { type: String, required: true },
    value: { type: Number, required: true },
    threshold: { type: Number, required: true },
  },
  affectedWards: [{ type: String, required: true }],
  recommendations: [{ type: String }],
  active: { type: Boolean, default: true },
  issuedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
}, { timestamps: true, bufferCommands: false, versionKey: false });

alertSchema.index({ active: 1, issuedAt: -1 });
alertSchema.index({ affectedWards: 1 });

export const Alert = mongoose.model('Alert', alertSchema);
