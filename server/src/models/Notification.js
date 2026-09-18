import mongoose from 'mongoose';

export const notificationTypes = [
  'simulated_weather_warning',
  'officer_confirmed_incident',
  'incident_resolved',
];

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: notificationTypes, required: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  area: { type: String, required: true, trim: true },
  severity: { type: String, enum: ['advisory', 'warning', 'danger', 'severe', 'resolved', 'info'], default: 'warning' },
  source: { type: String, required: true, trim: true },
  incidentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident' },
  alertId: { type: String },
  read: { type: Boolean, default: false, index: true },
  dedupKey: { type: String, required: true, unique: true },
  emailDelivery: {
    attempted: { type: Boolean, default: false },
    sent: { type: Boolean, default: false },
    recipientEmail: { type: String, lowercase: true, trim: true },
    status: { type: String, enum: ['none', 'sent', 'failed', 'skipped'], default: 'none' },
    error: { type: String },
    sentAt: { type: Date },
  },
}, { timestamps: true, bufferCommands: false });

schema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', schema);
