import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCitizenNearIncident,
  isCitizenNearWeatherAlert,
} from '../src/services/notificationService.js';
import {
  sendWarningEmail,
  sendVerificationCodeEmail,
  getSentEmails,
  clearSentEmails,
} from '../src/services/emailService.js';
import { DEMO_WARDS } from '../src/data/demoRegion.js';

test('isCitizenNearIncident matches by saved ward ID or coordinates within proximity threshold', () => {
  const grandpassWard = DEMO_WARDS.find(w => w.id === 'ward-grandpass');
  assert.ok(grandpassWard);

  const citizenGrandpass = {
    optInAlerts: true,
    wardId: 'ward-grandpass',
    wardName: 'Grandpass / Nagalagam',
    latitude: 6.9535,
    longitude: 79.8732,
  };

  const citizenBorella = {
    optInAlerts: true,
    wardId: 'ward-borella',
    wardName: 'Borella',
    latitude: 6.9147,
    longitude: 79.8778,
  };

  const grandpassIncident = {
    title: 'Baseline Road Flood Barrier Breach',
    ward: { id: 'ward-grandpass', name: 'Grandpass / Nagalagam' },
    center: { latitude: 6.9535, longitude: 79.8732 },
    isRoadClosed: true,
  };

  // 1. Direct ward match
  assert.equal(isCitizenNearIncident(citizenGrandpass, grandpassIncident), true);

  // 2. Far away citizen does not match
  assert.equal(isCitizenNearIncident(citizenBorella, grandpassIncident), false);

  // 3. Citizen with coordinates near incident but without wardId matches via Haversine distance
  const citizenNearCoordsOnly = {
    optInAlerts: true,
    latitude: 6.9540,
    longitude: 79.8735,
  };
  assert.equal(isCitizenNearIncident(citizenNearCoordsOnly, grandpassIncident), true);
});

test('isCitizenNearWeatherAlert matches by affected wards list or affected ward radius', () => {
  const citizenWellampitiya = {
    optInAlerts: true,
    wardId: 'ward-wellampitiya',
    wardName: 'Wellampitiya',
    latitude: 6.9468,
    longitude: 79.8895,
  };

  const citizenCinnamon = {
    optInAlerts: true,
    wardId: 'ward-cinnamon-gardens',
    wardName: 'Cinnamon Gardens',
    latitude: 6.9044,
    longitude: 79.8672,
  };

  const kelaniRiverAlert = {
    title: 'Kelani Ganga Minor Flood Warning',
    severity: 'warning',
    affectedWards: ['ward-grandpass', 'ward-wellampitiya'],
  };

  // Wellampitiya citizen is in affectedWards
  assert.equal(isCitizenNearWeatherAlert(citizenWellampitiya, kelaniRiverAlert), true);

  // Cinnamon Gardens citizen is not in affectedWards
  assert.equal(isCitizenNearWeatherAlert(citizenCinnamon, kelaniRiverAlert), false);
});

test('sendWarningEmail enforces privacy, formats warning types, and records delivery to outbox', async () => {
  clearSentEmails();

  const timestamp = new Date('2026-09-12T14:30:00.000Z');

  // Test 1: Simulated Weather Warning email
  const res1 = await sendWarningEmail({
    to: 'citizen.test@example.com',
    area: 'Grandpass / Nagalagam',
    warningType: 'River Gauge Flood Alert',
    category: 'simulated_weather_warning',
    timestamp,
    detailsUrl: 'http://127.0.0.1:5173/#citizen',
  });

  assert.equal(res1.success, true);
  assert.equal(res1.status, 'sent');
  assert.equal(res1.recipient, 'citizen.test@example.com');
  assert.match(res1.subject, /\[SIMULATED FLOOD WARNING\]/);

  const emails = getSentEmails();
  assert.equal(emails.length, 1);
  const sent1 = emails[0];

  // Privacy assertions: verify required safe fields are present
  assert.match(sent1.textBody, /Affected Area:\s+Grandpass \/ Nagalagam/);
  assert.match(sent1.textBody, /Warning Type:\s+River Gauge Flood Alert/);
  assert.match(sent1.textBody, /2026-09-12T14:30:00.000Z/);
  assert.match(sent1.textBody, /http:\/\/127\.0\.0\.1:5173\/#citizen/);
  assert.match(sent1.textBody, /SIMULATED HYDROLOGICAL MONITOR/);

  // Strict privacy contract: verify sensitive items are absent
  assert.doesNotMatch(sent1.textBody, /image evidence/i);
  assert.doesNotMatch(sent1.textBody, /report description/i);
  assert.doesNotMatch(sent1.textBody, /latitude/i);
  assert.doesNotMatch(sent1.textBody, /longitude/i);

  // Test 2: Incident Resolved email
  const res2 = await sendWarningEmail({
    to: 'citizen.test@example.com',
    area: 'Grandpass / Nagalagam',
    warningType: 'Baseline Road Flood Clearance',
    category: 'incident_resolved',
    timestamp,
  });

  assert.equal(res2.success, true);
  assert.match(res2.subject, /\[HAZARD RESOLVED\]/);
  assert.match(getSentEmails()[0].textBody, /OFFICIAL FIELD CREW RESOLUTION/);

  // Test 3: Invalid email returns failure without throwing
  const failRes = await sendWarningEmail({
    to: 'not-an-email',
    area: 'Test',
    warningType: 'Test',
    category: 'officer_confirmed_incident',
  });
  assert.equal(failRes.success, false);
  assert.equal(failRes.status, 'failed');
  assert.ok(failRes.error);
});

test('sendVerificationCodeEmail formats 6-digit OTP and logs delivery to outbox', async () => {
  clearSentEmails();

  const res = await sendVerificationCodeEmail({
    to: 'citizen.perera@example.com',
    code: '748291',
    username: 'Kasun Perera',
    purpose: 'registration',
  });

  assert.equal(res.success, true);
  assert.equal(res.status, 'sent');
  assert.equal(res.code, '748291');

  const emails = getSentEmails();
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'citizen.perera@example.com');
  assert.match(emails[0].subject, /748291/);
  assert.match(emails[0].textBody, /748291/);
  assert.match(emails[0].textBody, /Kasun Perera/);

  // Rejects invalid email
  const fail = await sendVerificationCodeEmail({
    to: 'invalid-email',
    code: '123456',
  });
  assert.equal(fail.success, false);
  assert.equal(fail.status, 'failed');
});

