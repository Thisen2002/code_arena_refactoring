import mongoose from 'mongoose';
export const roles = ['citizen', 'officer', 'crew', 'relief', 'admin'];
const schema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: roles, default: 'citizen', required: true },
  demo: { type: Boolean, default: false },
  isRestricted: { type: Boolean, default: false },
  restrictionReason: { type: String, default: '' },
  fullName: { type: String, trim: true, default: '' },
  nic: { type: String, trim: true, uppercase: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  emailVerified: { type: Boolean, default: false },
  emailOtp: {
    codeHash: { type: String, select: false },
    expiresAt: { type: Date, select: false },
    pendingEmail: { type: String, select: false },
  },
  savedLocation: {
    optInAlerts: { type: Boolean, default: false },
    wardId: { type: String, trim: true },
    wardName: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    email: { type: String, trim: true, lowercase: true },
    channelEmail: { type: Boolean, default: false },
    updatedAt: { type: Date },
  },
}, { timestamps: true, bufferCommands: false });
export const User = mongoose.model('User', schema);
