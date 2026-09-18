import mongoose from 'mongoose';

const shelterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  wardId: { type: String, required: true },
  wardName: { type: String, required: true },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  maxCapacity: { type: Number, required: true, min: 1 },
  currentOccupancy: { type: Number, default: 0, min: 0 },
  resources: {
    cleanWater: { type: Boolean, default: true },
    foodRations: { type: Boolean, default: true },
    medicalFirstAid: { type: Boolean, default: true },
    beddingPacks: { type: Boolean, default: true },
  },
  status: {
    type: String,
    enum: ['open', 'near_capacity', 'full', 'closed'],
    default: 'open',
  },
  contactPerson: { type: String, default: 'Municipal Relief Warden' },
  contactPhone: { type: String, default: '+94 11 243 0000' },
}, { timestamps: true, bufferCommands: false, versionKey: false });

shelterSchema.index({ wardId: 1, status: 1 });

export const Shelter = mongoose.model('Shelter', shelterSchema);

export const DEFAULT_SHELTERS = [
  {
    name: 'Modara St. James Community Centre',
    wardId: 'ward-modara',
    wardName: 'Modara / Colombo North',
    location: { latitude: 6.9680, longitude: 79.8650 },
    maxCapacity: 150,
    currentOccupancy: 35,
    resources: { cleanWater: true, foodRations: true, medicalFirstAid: true, beddingPacks: true },
    status: 'open',
    contactPerson: 'Officer K. Perera',
    contactPhone: '+94 11 252 1122',
  },
  {
    name: 'Grandpass Sri Kalyani Hall',
    wardId: 'ward-grandpass',
    wardName: 'Grandpass / Nagalagam Street',
    location: { latitude: 6.9540, longitude: 79.8745 },
    maxCapacity: 200,
    currentOccupancy: 140,
    resources: { cleanWater: true, foodRations: true, medicalFirstAid: true, beddingPacks: false },
    status: 'near_capacity',
    contactPerson: 'Warden M. Silva',
    contactPhone: '+94 11 243 5566',
  },
  {
    name: 'Kolonnawa Technical College Campus',
    wardId: 'ward-kolonnawa',
    wardName: 'Kolonnawa / Orugodawatta',
    location: { latitude: 6.9390, longitude: 79.8830 },
    maxCapacity: 300,
    currentOccupancy: 85,
    resources: { cleanWater: true, foodRations: true, medicalFirstAid: true, beddingPacks: true },
    status: 'open',
    contactPerson: 'Coordinator S. Fernando',
    contactPhone: '+94 11 253 9988',
  },
  {
    name: 'Borella Campbell Park Disaster Centre',
    wardId: 'ward-borella',
    wardName: 'Borella / Baseline Corridor',
    location: { latitude: 6.9160, longitude: 79.8760 },
    maxCapacity: 250,
    currentOccupancy: 40,
    resources: { cleanWater: true, foodRations: true, medicalFirstAid: true, beddingPacks: true },
    status: 'open',
    contactPerson: 'Dr. N. Jayawardena',
    contactPhone: '+94 11 269 4433',
  },
  {
    name: 'Cinnamon Gardens Sports Complex',
    wardId: 'ward-cinnamon-gardens',
    wardName: 'Cinnamon Gardens / Colombo 07',
    location: { latitude: 6.9050, longitude: 79.8680 },
    maxCapacity: 400,
    currentOccupancy: 60,
    resources: { cleanWater: true, foodRations: true, medicalFirstAid: true, beddingPacks: true },
    status: 'open',
    contactPerson: 'Superintendent R. Wickramasinghe',
    contactPhone: '+94 11 268 7700',
  },
];

export async function ensureDefaultShelters() {
  try {
    const count = await Shelter.countDocuments();
    if (count === 0) {
      await Shelter.insertMany(DEFAULT_SHELTERS);
    }
  } catch {
    // Ignore if DB not ready
  }
}
