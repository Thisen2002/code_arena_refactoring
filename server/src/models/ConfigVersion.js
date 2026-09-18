import mongoose from 'mongoose';

const configVersionSchema = new mongoose.Schema({
  version: { type: Number, required: true, unique: true },
  isActive: { type: Boolean, default: false },
  parameters: {
    weatherThresholds: {
      alertMmH: { type: Number, default: 30 },
      alertRiverFeet: { type: Number, default: 5.0 },
      minorFloodRiverFeet: { type: Number, default: 7.0 },
      majorFloodRiverFeet: { type: Number, default: 8.0 },
    },
    clusterRadiusMeters: { type: Number, default: 200 },
    clusterWindowHours: { type: Number, default: 4 },
    aiModel: { type: String, default: 'gemini-3.8-flash' },
    aiPromptInstructions: {
      type: String,
      default: 'Analyze disaster scene evidence for floods and road blockages in Sri Lanka. Strictly maintain locationEvidence as unknown since photos cannot verify GPS coordinates.',
    },
  },
  changeSummary: { type: String, required: true },
  deployedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deployedAt: { type: Date, default: Date.now },
}, { timestamps: true, bufferCommands: false, versionKey: false });

configVersionSchema.index({ version: -1 });
configVersionSchema.index({ isActive: 1 });

export const ConfigVersion = mongoose.model('ConfigVersion', configVersionSchema);

export const DEFAULT_CONFIG = {
  version: 1,
  isActive: true,
  parameters: {
    weatherThresholds: {
      alertMmH: 30,
      alertRiverFeet: 5.0,
      minorFloodRiverFeet: 7.0,
      majorFloodRiverFeet: 8.0,
    },
    clusterRadiusMeters: 200,
    clusterWindowHours: 4,
    aiModel: 'gemini-3.8-flash',
    aiPromptInstructions:
      'Analyze disaster scene evidence for floods and road blockages in Sri Lanka. Strictly maintain locationEvidence as unknown since photos cannot verify GPS coordinates.',
  },
  changeSummary: 'Baseline system configuration initialized for Colombo/Kelani flood response.',
};

export async function ensureDefaultConfig() {
  try {
    const existing = await ConfigVersion.findOne({ isActive: true });
    if (!existing) {
      const count = await ConfigVersion.countDocuments();
      if (count === 0) {
        await ConfigVersion.create(DEFAULT_CONFIG);
      } else {
        // Activate the latest version
        await ConfigVersion.findOneAndUpdate({}, { $set: { isActive: true } }, { sort: { version: -1 } });
      }
    }
  } catch {
    // Graceful fallback if DB is not ready
  }
}
