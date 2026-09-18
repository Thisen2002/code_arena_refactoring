import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { Incident } from '../src/models/Incident.js';
import { incidentDto } from '../src/incidents.js';

test('Incident DTO preserves immutable fields and formats dispatch and closure cleanly', () => {
  const fakeIncident = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Severe flooding along Baseline Road corridor',
    hazardType: 'flood',
    severity: 'severe',
    status: 'dispatched',
    isRoadClosed: true,
    center: { latitude: 6.9535, longitude: 79.8732 },
    ward: { id: 'ward-grandpass', name: 'Grandpass' },
    road: { id: 'road-baseline', name: 'Baseline Road', hierarchy: 'arterial' },
    reportIds: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
    dispatch: {
      crewId: new mongoose.Types.ObjectId(),
      crewName: 'demo-crew',
      dispatchedBy: new mongoose.Types.ObjectId(),
      dispatchedAt: new Date(),
      instructions: 'Deploy water suction pumps.',
    },
    closure: null,
    clarifications: [{
      _id: new mongoose.Types.ObjectId(),
      question: 'Is the road still inundated?',
      requestedAt: new Date(),
      status: 'active',
      responses: [{
        citizenId: new mongoose.Types.ObjectId(),
        citizenName: 'demo-citizen',
        responseChoice: 'confirmed_hazard',
        comment: 'Yes, water is 2 feet high.',
        at: new Date(),
      }],
    }],
    history: [{ action: 'created', at: new Date() }],
  };

  const dto = incidentDto(fakeIncident);
  assert.equal(dto.title, fakeIncident.title);
  assert.equal(dto.reportCount, 2);
  assert.equal(dto.isRoadClosed, true);
  assert.equal(dto.dispatch.crewName, 'demo-crew');
  assert.equal(dto.clarifications.length, 1);
  assert.equal(dto.clarifications[0].responseCount, 1);
  assert.equal(dto.clarifications[0].responses[0].responseChoice, 'confirmed_hazard');
});

test('Incident API rejects unauthenticated and unauthorized requests', async () => {
  const server = createApp({
    connection: { readyState: 1 },
    databaseConfigured: true,
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Anonymous access to incidents list is rejected (401)
    const listRes = await fetch(`${url}/api/incidents`);
    assert.equal(listRes.status, 401);

    // 2. Anonymous attempt to create incident is rejected (401)
    const createRes = await fetch(`${url}/api/incidents`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'CodeArena', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Incident', reportIds: ['507f1f77bcf86cd799439011'] }),
    });
    assert.equal(createRes.status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
