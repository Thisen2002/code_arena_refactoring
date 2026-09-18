import mongoose from 'mongoose';
import sharp from 'sharp';
import exifr from 'exifr';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export async function inspectImage(bytes) {
  if (!bytes?.length || bytes.length > MAX_PHOTO_BYTES) throw Object.assign(new Error('Photo must be nonempty and no larger than 5 MiB.'), { code: 'INVALID_IMAGE' });
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: 'error' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Unsupported image.');
    await image.stats(); // Decode pixels; MIME or filename alone is not validation.
    let gps;
    try { gps = await exifr.gps(bytes); } catch { /* Missing/unreadable metadata remains unknown. */ }
    const exifGps = gps && Number.isFinite(gps.latitude) && Math.abs(gps.latitude) <= 90 && Number.isFinite(gps.longitude) && Math.abs(gps.longitude) <= 180 ? { latitude: gps.latitude, longitude: gps.longitude } : undefined;
    return { mimeType: `image/${metadata.format}`, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width: metadata.width, height: metadata.height, exifGps };
  } catch { throw Object.assign(new Error('Use a valid, non-animated JPEG, PNG or WebP image of at most 20 megapixels.'), { code: 'INVALID_IMAGE' }); }
}
export function evidenceStore(connection = mongoose.connection) {
  const bucket = () => new mongoose.mongo.GridFSBucket(connection.db, { bucketName: 'evidence' });
  return {
    async save(bytes, metadata) {
      const upload = bucket().openUploadStream(randomUUID(), { metadata: { mimeType: metadata.mimeType, sha256: metadata.sha256, ownerId: metadata.ownerId, submissionKey: metadata.submissionKey } });
      try { await pipeline(Readable.from([bytes]), upload); }
      catch (error) { await bucket().delete(upload.id).catch(() => {}); throw error; }
      return upload.id;
    },
    remove: id => bucket().delete(id),
    open: id => bucket().openDownloadStream(id),
    async readBuffer(id) {
      const stream = bucket().openDownloadStream(id);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    },
  };
}
