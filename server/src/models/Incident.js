import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
  hazardType: {
    type: String,
    enum: ['flood', 'blocked_road', 'fallen_tree', 'landslide', 'structural_damage', 'other'],
    default: 'flood',
  },
  severity: {
    type: String,
    enum: ['minor', 'moderate', 'severe', 'critical'],
    default: 'moderate',
  },
  status: {
    type: String,
    enum: ['open', 'dispatched', 'in_progress', 'closed'],
    default: 'open',
  },
  isRoadClosed: { type: Boolean, default: false },
  center: {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
  },
  ward: {
    id: { type: String, default: 'unknown' },
    name: { type: String, default: 'Unmapped ward' },
  },
  road: {
    id: { type: String, default: 'unmapped' },
    name: { type: String, default: 'Local access road' },
    hierarchy: { type: String, default: 'local' },
  },
  reportIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report', index: true }],
  dispatch: {
    crewId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    crewName: { type: String },
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dispatchedAt: { type: Date },
    instructions: { type: String, maxlength: 1000 },
  },
  closure: {
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
    notes: { type: String, maxlength: 2000 },
    photo: {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      mimeType: { type: String },
      size: { type: Number },
      sha256: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
  },
  clarifications: [{
    question: { type: String, required: true, trim: true, maxlength: 500 },
    requestedAt: { type: Date, default: Date.now },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['active', 'resolved'], default: 'active' },
    responses: [{
      citizenId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      citizenName: { type: String },
      responseChoice: { type: String, enum: ['confirmed_hazard', 'hazard_cleared', 'uncertain'] },
      comment: { type: String, maxlength: 500 },
      at: { type: Date, default: Date.now },
    }],
  }],
  history: [{
    _id: false,
    action: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId },
    actorRole: { type: String },
    at: { type: Date, default: Date.now },
    details: { type: mongoose.Schema.Types.Mixed },
  }],
}, { timestamps: true, versionKey: false });

incidentSchema.index({ status: 1, createdAt: -1 });
incidentSchema.index({ 'center.latitude': 1, 'center.longitude': 1 });

export const Incident = mongoose.model('Incident', incidentSchema);
