import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

test('single-origin hosting serves assets but preserves API 404 and readiness semantics', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codearena-hosting-'));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Hosting fixture</title>');
  await writeFile(path.join(directory, 'asset.js'), 'console.log("fixture")');
  const server = createApp({ connection: { readyState: 0 }, clientDirectory: directory }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(url); assert.equal(page.status, 200); assert.match(await page.text(), /Hosting fixture/);
    assert.equal((await fetch(`${url}/asset.js`)).status, 200);
    const missing = await fetch(`${url}/api/unknown`); assert.equal(missing.status, 404); assert.deepEqual(await missing.json(), { error: 'Not found.' });
    assert.equal((await fetch(`${url}/api/health`)).status, 503);
    assert.equal((await fetch(`${url}/.env`)).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
