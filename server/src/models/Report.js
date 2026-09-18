import mongoose from 'mongoose';
const reportSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  kind: { type: String, enum: ['hazard', 'help'], default: 'hazard' },
  helpCategory: { type: String, enum: ['rescue', 'medical', 'food', 'water', 'shelter', 'other'] },
  description: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  locationSource: { type: String, enum: ['manual', 'device'], default: 'manual' },
  gpsAccuracy: { type: Number, min: 0 },
  photo: {
    fileId: mongoose.Schema.Types.ObjectId, mimeType: String, size: Number, sha256: String,
    width: Number, height: Number,
    exifGps: { latitude: Number, longitude: Number },
  },
  submissionKey: { type: String },
  requestHash: { type: String, select: false },
  history: [{ _id: false, action: String, actorId: mongoose.Schema.Types.ObjectId, at: Date }],
  status: { type: String, enum: ['submitted', 'under_review', 'confirmed', 'rejected', 'dispatched', 'resolved'], default: 'submitted' },
  locationEvidence: { type: String, enum: ['unverified'], default: 'unverified', immutable: true },
  incidentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', index: true },
  assessment: {
    status: { type: String, enum: ['pending', 'evaluated', 'failed'], default: 'pending' },
    caseSnapshot: { type: mongoose.Schema.Types.Mixed },
    checks: { type: mongoose.Schema.Types.Mixed },
    aggregator: { type: mongoose.Schema.Types.Mixed },
    evaluatedAt: Date,
    evaluator: { type: mongoose.Schema.Types.Mixed },
    error: String,
  },
  reliefAssignment: {
    shelterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shelter' },
    shelterName: String,
    assignedAt: Date,
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    partySize: { type: Number, default: 1 },
    status: { type: String, enum: ['unassigned', 'assigned', 'sheltered'], default: 'unassigned' },
    notes: String,
  },
}, { timestamps: true, bufferCommands: false, versionKey: false });
reportSchema.index({ createdAt: -1, _id: -1 });
reportSchema.index({ 'assessment.status': 1 });
reportSchema.index({ ownerId: 1, submissionKey: 1 }, { unique: true, partialFilterExpression: { submissionKey: { $type: 'string' } } });
export const Report = mongoose.model('Report', reportSchema);
