import '../src/config.js';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute } from 'node:path';
import { assessImage } from '../src/ai/gemini.js';
const imagePath = process.argv[2];
const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
try {
  if (!imagePath || !isAbsolute(imagePath)) throw new Error('Use an absolute local image path: npm run smoke:gemini -- "C:/path/image.jpg"');
  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) throw new Error('Configure GEMINI_API_KEY and GEMINI_MODEL in server/.env.');
  const mimeType = mime[extname(imagePath).toLowerCase()];
  if (!mimeType) throw new Error('Use a JPEG, PNG, or WebP image.');
  const info = await stat(imagePath);
  if (!info.isFile() || info.size === 0 || info.size > 5 * 1024 * 1024) throw new Error('Use a nonempty image file no larger than 5 MiB.');
  const bytes = await readFile(imagePath);
  try {
    const assessment = await assessImage({ bytes, mimeType, apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL });
    console.log(JSON.stringify({ source: 'live-gemini-smoke-test', assessment }, null, 2));
  } catch { throw new Error('Gemini request or response validation failed. Check credentials, model availability, quota, and image validity. Provider details are suppressed to protect secrets.'); }
} catch (error) {
  // File-system exceptions may contain sensitive local paths; only known messages are displayed.
  console.error(error.code ? 'Cannot read the local image. Check the path and permissions.' : error.message);
  process.exitCode = 1;
}
