import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { Report } from '../src/models/Report.js';
import { reportInput, listInput } from '../src/validation.js';
import { credentials, registrationSchema, hashPassword, verifyPassword, digest, allow } from '../src/auth.js';
import { reportScope, reportDto } from '../src/reports.js';
import { inspectImage } from '../src/evidence.js';
import { assessmentSchema } from '../src/ai/gemini.js';

async function withServer(options, run) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const valid = { kind: 'hazard', description: 'Water rising near the bridge', latitude: 7, longitude: 80, locationSource: 'manual', submissionKey: randomUUID() };
test('health distinguishes server availability and all database states', async () => {
  for (const readyState of [0, 1, 2, 3]) await withServer({ connection: { readyState }, databaseConfigured: true }, async url => {
    const response = await fetch(`${url}/api/health`);
    assert.equal(response.status, readyState === 1 ? 200 : 503);
    assert.equal((await response.json()).ready, readyState === 1);
  });
});
test('database outage has no fallback storage', async () => {
  await withServer({ connection: { readyState: 0 } }, async url => {
    assert.equal((await fetch(`${url}/api/reports`)).status, 503);
    assert.equal((await fetch(`${url}/api/reports`, { method: 'POST', headers: { 'X-Requested-With': 'CodeArena' } })).status, 503);
  });
});
test('anonymous access is denied even when database is connected', async () => {
  await withServer({ connection: { readyState: 1 } }, async url => {
    assert.equal((await fetch(`${url}/api/reports`)).status, 401);
    assert.equal((await fetch(`${url}/api/reports/507f1f77bcf86cd799439011/photo`)).status, 401);
  });
});
test('cross-site and unprotected writes are rejected before processing input', async () => {
  await withServer({ connection: { readyState: 1 } }, async url => {
    assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST' })).status, 403);
    assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'X-Requested-With': 'CodeArena', Origin: 'https://attacker.invalid' } })).status, 403);
  });
});
test('malformed JSON and oversized requests never echo sensitive payloads', async () => {
  await withServer({ connection: { readyState: 1 } }, async url => {
    const headers = { 'X-Requested-With': 'CodeArena', 'Content-Type': 'application/json' };
    const r = await fetch(`${url}/api/auth/login`, { method: 'POST', headers, body: '{"password":"private-test-value",' });
    assert.equal(r.status, 400); assert.ok(!(await r.text()).includes('private-test-value'));
    assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST', headers, body: JSON.stringify({ password: 'a'.repeat(20000) }) })).status, 413);
  });
});
test('report validation rejects invalid coordinates, blank descriptions and forged status', () => {
  assert.ok(reportInput.safeParse(valid).success);
  for (const patch of [{ latitude: '' }, { latitude: 91 }, { longitude: -181 }, { description: ' '.repeat(20) }, { description: 'a'.repeat(2001) }, { status: 'confirmed' }, { ownerId: 'someone-else' }, { latitude: null }, { latitude: NaN }, { submissionKey: 'not-a-uuid' }]) assert.equal(reportInput.safeParse({ ...valid, ...patch }).success, false);
});
test('help category is required only for help; manual accuracy is not fabricated', () => {
  assert.ok(reportInput.safeParse({ ...valid, kind: 'help', helpCategory: 'medical' }).success);
  assert.ok(!reportInput.safeParse({ ...valid, kind: 'help' }).success);
  assert.ok(!reportInput.safeParse({ ...valid, helpCategory: 'medical' }).success);
  assert.ok(!reportInput.safeParse({ ...valid, gpsAccuracy: 10 }).success);
  assert.ok(reportInput.safeParse({ ...valid, locationSource: 'device', gpsAccuracy: 10 }).success);
});
test('pagination bounds and query operators are rejected', () => {
  assert.deepEqual(listInput.parse({}), { limit: 50, offset: 0 });
  for (const q of [{ limit: '0' }, { limit: '101' }, { offset: '-1' }, { limit: { $gt: 1 } }, { unknown: 'true' }]) assert.ok(!listInput.safeParse(q).success);
});
test('public registration schema rejects role escalation and weak credentials', () => {
  const input = { username: 'test-citizen', password: 'a-strong-test-password' };
  assert.ok(credentials.safeParse(input).success);
  assert.ok(!credentials.safeParse({ ...input, role: 'admin' }).success);
  assert.ok(!credentials.safeParse({ ...input, password: 'short' }).success);

  // Full registration schema validation
  assert.ok(registrationSchema.safeParse({
    username: 'citizen-sample',
    password: 'securePassword123',
    confirmPassword: 'securePassword123',
    fullName: 'Kasun Perera',
    nic: '123456789V',
    email: 'kasun.perera@example.com',
  }).success);

  // Validates 12-digit new NIC
  assert.ok(registrationSchema.safeParse({
    username: 'citizen-new-nic',
    password: 'securePassword123',
    confirmPassword: 'securePassword123',
    nic: '199512345678',
  }).success);

  // Rejects invalid NIC formats
  assert.ok(!registrationSchema.safeParse({
    username: 'citizen-bad-nic',
    password: 'securePassword123',
    confirmPassword: 'securePassword123',
    nic: '12345', // too short
  }).success);

  assert.ok(!registrationSchema.safeParse({
    username: 'citizen-bad-nic-2',
    password: 'securePassword123',
    confirmPassword: 'securePassword123',
    nic: '1234567890123', // 13 digits
  }).success);

  // Rejects password confirmation mismatch
  assert.ok(!registrationSchema.safeParse({
    username: 'citizen-mismatch',
    password: 'securePassword123',
    confirmPassword: 'differentPassword456',
  }).success);
});
test('password hashing uses salt, verifies only the matching password, session digest is irreversible', async () => {
  const a = await hashPassword('test-long-password'); const b = await hashPassword('test-long-password');
  assert.notEqual(a, b); assert.ok(await verifyPassword('test-long-password', a));
  assert.ok(!(await verifyPassword('wrong-password', a))); assert.ok(!(await verifyPassword('test-long-password', 'bad')));
  assert.equal(digest('token').length, 64); assert.notEqual(digest('token'), 'token');
});
test('role middleware denies unauthorized staff actions', () => {
  let code; let continued = false;
  const res = { status(n) { code = n; return this; }, json() {} };
  allow('officer')({ user: { role: 'citizen' } }, res, () => { continued = true; });
  assert.equal(code, 403); assert.equal(continued, false);
  allow('officer')({ user: { role: 'officer' } }, res, () => { continued = true; }); assert.equal(continued, true);
});
test('report scopes isolate citizens, relief and crew', () => {
  assert.deepEqual(reportScope({ role: 'citizen', _id: 'owner' }), { ownerId: 'owner' });
  assert.deepEqual(reportScope({ role: 'relief' }), { kind: 'help' });
  assert.deepEqual(reportScope({ role: 'officer' }), {}); assert.equal(reportScope({ role: 'crew' }), null);
});
test('image inspection decodes real pixels, hashes originals, keeps missing EXIF unknown', async () => {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#286a55' } }).png().toBuffer();
  const photo = await inspectImage(bytes);
  assert.equal(photo.mimeType, 'image/png'); assert.equal(photo.exifGps, undefined); assert.equal(photo.width, 8);
  assert.equal(photo.sha256, digest(bytes)); assert.equal(photo.size, bytes.length);
  await assert.rejects(inspectImage(Buffer.from('<svg><script>alert(1)</script></svg>')));
  await assert.rejects(inspectImage(Buffer.from('not an image')));
  await assert.rejects(inspectImage(Buffer.alloc(5 * 1024 * 1024 + 1)));
});
test('legacy Report defaults preserved and private storage fields are not returned', async () => {
  const report = new Report({ description: valid.description, latitude: 7, longitude: 80 }); await report.validate();
  assert.equal(report.status, 'submitted'); assert.equal(report.locationEvidence, 'unverified');
  const dto = reportDto(report); assert.equal(dto.legacy, true); assert.equal(dto.photo, null); assert.equal(dto.requestHash, undefined);
  await assert.rejects(new Report({ ...valid, longitude: 200 }).validate());
});
test('reportDto maps multiple photos to separate endpoints correctly', () => {
  const mockReport = {
    _id: 'report123',
    kind: 'hazard',
    description: 'Test multiple photos',
    latitude: 6.9, longitude: 79.8,
    photo: { fileId: 'file1', mimeType: 'image/jpeg', size: 1000, sha256: 'abc' },
    extraPhotos: [
      { fileId: 'file2', mimeType: 'image/png', size: 2000 },
      { fileId: 'file3', mimeType: 'image/webp', size: 3000 }
    ],
    toObject() { return this; }
  };
  
  const dto = reportDto(mockReport);
  assert.equal(dto.photo.url, '/api/reports/report123/photo');
  assert.equal(dto.extraPhotos.length, 2);
  assert.equal(dto.extraPhotos[0].url, '/api/reports/report123/extra-photos/0');
  assert.equal(dto.extraPhotos[0].mimeType, 'image/png');
  assert.equal(dto.extraPhotos[1].url, '/api/reports/report123/extra-photos/1');
  assert.equal(dto.extraPhotos[1].mimeType, 'image/webp');
});
test('AI schema rejects invented location evidence and invalid confidence', () => {
  const sample = { hazard: 'unknown', risk: 'unknown', reasons: ['Test fixture'], uncertainty: ['No GPS evidence'], confidence: 0.2, locationEvidence: 'unknown', needsMoreInformation: true };
  assert.ok(assessmentSchema.safeParse(sample).success);
  assert.ok(!assessmentSchema.safeParse({ ...sample, confidence: 2 }).success);
  assert.ok(!assessmentSchema.safeParse({ ...sample, locationEvidence: 'verified' }).success);
});
