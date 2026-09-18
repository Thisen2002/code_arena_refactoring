import '../src/config.js';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { Report } from '../src/models/Report.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { hashPassword } from '../src/auth.js';
import { evidenceStore } from '../src/evidence.js';

// Real MongoDB/GridFS integration. Deletes only its own generated test accounts/evidence.
let server; let stage = 'configuration'; const userIds = [];
const prefix = `verify-${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('base64url');
const cookies = {};
let url;
const start = () => new Promise(resolve => { server = createApp({ databaseConfigured: true }).listen(0, '127.0.0.1', () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); }); });
const close = () => new Promise(resolve => server.close(resolve));
async function call(path, role, options = {}) {
  return fetch(`${url}${path}`, { ...options, headers: { 'X-Requested-With': 'CodeArena', ...(role ? { Cookie: cookies[role] } : {}), ...options.headers } });
}
async function jsonPost(path, data, role) { return call(path, role, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); }
try {
  if (!process.env.MONGODB_URI) throw new Error();
  stage = 'MongoDB connection';
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Session.init(), Report.init()]);
  await start();
  stage = 'registration and login';
  for (const role of ['citizen', 'other', 'officer', 'relief', 'crew']) {
    const user = await User.create({ username: `${prefix}-${role}`, passwordHash: await hashPassword(password), role: role === 'other' ? 'citizen' : role });
    userIds.push(user._id);
    const response = await jsonPost('/api/auth/login', { username: user.username, password });
    assert.equal(response.status, 200); cookies[role] = response.headers.get('set-cookie').split(';')[0];
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  }
  assert.equal((await jsonPost('/api/auth/register', { username: `${prefix}-hack`, password, role: 'admin' })).status, 400);
  assert.equal((await call('/api/reports')).status, 401);
  assert.equal((await call('/api/reports', 'crew')).status, 403);
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#26785d' } }).png().toBuffer();
  const base = { kind: 'hazard', description: `Synthetic upload verification ${prefix}`, latitude: 7.1, longitude: 80.6, locationSource: 'manual', submissionKey: randomUUID() };
  async function submit(data, role = 'citizen', photo = bytes) {
    const form = new FormData(); form.append('report', JSON.stringify(data));
    if (photo) form.append('photo', new Blob([photo], { type: 'image/png' }), 'test.png');
    return call('/api/reports', role, { method: 'POST', body: form });
  }
  stage = 'upload validation and role restrictions';
  assert.equal((await submit(base, 'officer')).status, 403);
  assert.equal((await submit(base, 'citizen', null)).status, 400);
  assert.equal((await submit(base, 'citizen', Buffer.from('not a photo'))).status, 400);
  assert.equal((await submit(base, 'citizen', Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
  stage = 'photo persistence and retry deduplication';
  const saved = await submit(base);
  if (saved.status !== 201) console.error(`Upload returned HTTP ${saved.status}.`);
  assert.equal(saved.status, 201);
  const report = (await saved.json()).report;
  assert.equal(report.photo.exifGps, null);
  assert.equal(report.history[0].action, 'submitted');
  stage = 'retry deduplication';
  assert.equal((await submit(base)).status, 200);
  assert.equal((await submit({ ...base, description: 'A changed report using the same key' })).status, 409);
  assert.equal(await Report.countDocuments({ ownerId: userIds[0] }), 1);
  stage = 'concurrent retry deduplication';
  const concurrent = { ...base, submissionKey: randomUUID() };
  const pair = await Promise.all([submit(concurrent), submit(concurrent)]);
  assert.deepEqual(pair.map(r => r.status).sort(), [200, 201]);
  assert.equal(await Report.countDocuments({ ownerId: userIds[0] }), 2);
  assert.equal(await mongoose.connection.db.collection('evidence.files').countDocuments({ 'metadata.ownerId': String(userIds[0]) }), 2);
  stage = 'photo byte verification';
  const file = await call(report.photo.url, 'citizen'); assert.equal(file.status, 200);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
  assert.equal(report.photo.sha256, createHash('sha256').update(bytes).digest('hex'));
  stage = 'ownership and staff visibility';
  assert.equal((await call(report.photo.url, 'other')).status, 404);
  assert.equal((await call(`/api/reports/${report._id}`, 'other')).status, 404);
  assert.equal((await call(report.photo.url)).status, 401);
  assert.equal((await call(report.photo.url, 'officer')).status, 200);
  assert.equal((await call(report.photo.url, 'relief')).status, 404);
  assert.equal((await (await call('/api/reports', 'other')).json()).reports.length, 0);
  const help = await submit({ ...base, kind: 'help', helpCategory: 'water', submissionKey: randomUUID() }); assert.equal(help.status, 201);
  const helpReport = (await help.json()).report;
  assert.equal((await call(helpReport.photo.url, 'relief')).status, 200);
  const reliefRows = (await (await call('/api/reports', 'relief')).json()).reports;
  assert.ok(reliefRows.every(r => r.kind === 'help')); assert.ok(reliefRows.some(r => r._id === helpReport._id));
  stage = 'reconnection and durable sessions/photos';
  await close(); await mongoose.disconnect();
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }); await start();
  assert.equal((await call(`/api/reports/${report._id}`, 'citizen')).status, 200);
  const reread = await call(report.photo.url, 'citizen'); assert.equal(reread.status, 200); assert.deepEqual(Buffer.from(await reread.arrayBuffer()), bytes);
  await call('/api/auth/logout', 'citizen', { method: 'POST' }); assert.equal((await call('/api/reports', 'citizen')).status, 401);
  console.log('PASS: real MongoDB/GridFS upload, original bytes/hash, hazard/help, auth/ownership/roles, retry deduplication, session/photo persistence after reconnection, and logout invalidation. Synthetic image fixture only; no AI claim.');
} catch { console.error(`FAIL/BLOCKED at ${stage}. Configuration and error details suppressed.`); process.exitCode = 1; }
finally {
  if (server?.listening) await close();
  if (mongoose.connection.readyState === 1 && userIds.length) {
    try {
      const created = await Report.find({ ownerId: { $in: userIds } }).lean();
      for (const r of created) if (r.photo?.fileId) await evidenceStore().remove(r.photo.fileId);
      await Report.deleteMany({ ownerId: { $in: userIds } });
      await Session.deleteMany({ userId: { $in: userIds } });
      await User.deleteMany({ _id: { $in: userIds } });
      console.log('Cleaned up only this run’s test accounts, reports, sessions and photos.');
    } catch { console.error('Test cleanup incomplete; inspect verification accounts before rerunning.'); process.exitCode = 1; }
  }
  await mongoose.disconnect();
}
