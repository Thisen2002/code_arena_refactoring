// Plain-Code Proximity Check and Nearby Warning Notification Service
// Triggers in-app alerts and optional email delivery for citizens' saved locations.
// Enforces strict privacy: never leaks report descriptions, photos, or citizen coordinates.

import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { DEMO_WARDS, haversineDistanceMeters } from '../data/demoRegion.js';
import { sendWarningEmail } from './emailService.js';

const PROXIMITY_THRESHOLD_METERS = 2500;

/**
 * Plain code proximity test between a citizen's saved location and an operational incident.
 */
export function isCitizenNearIncident(savedLocation, incident) {
  if (!savedLocation || !incident) return false;

  // 1. Direct ward match
  if (savedLocation.wardId && incident.ward?.id && savedLocation.wardId === incident.ward.id) {
    return true;
  }

  // 2. Exact coordinates distance check via Haversine formula
  const sLat = Number(savedLocation.latitude);
  const sLon = Number(savedLocation.longitude);
  const iLat = Number(incident.center?.latitude);
  const iLon = Number(incident.center?.longitude);

  if (Number.isFinite(sLat) && Number.isFinite(sLon) && Number.isFinite(iLat) && Number.isFinite(iLon)) {
    const dist = haversineDistanceMeters(sLat, sLon, iLat, iLon);
    return dist <= PROXIMITY_THRESHOLD_METERS;
  }

  return false;
}

/**
 * Plain code proximity test between a citizen's saved location and a hydrological weather alert.
 */
export function isCitizenNearWeatherAlert(savedLocation, alert) {
  if (!savedLocation || !alert) return false;

  const affectedWards = alert.affectedWards || [];

  // 1. Direct ward match
  if (savedLocation.wardId && affectedWards.includes(savedLocation.wardId)) {
    return true;
  }

  // 2. Coordinate check against centers of affected wards
  const sLat = Number(savedLocation.latitude);
  const sLon = Number(savedLocation.longitude);
  if (Number.isFinite(sLat) && Number.isFinite(sLon) && affectedWards.length > 0) {
    for (const wardId of affectedWards) {
      const wardDef = DEMO_WARDS.find(w => w.id === wardId);
      if (wardDef?.center) {
        const dist = haversineDistanceMeters(sLat, sLon, wardDef.center.latitude, wardDef.center.longitude);
        if (dist <= (wardDef.radiusMeters || PROXIMITY_THRESHOLD_METERS)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Dispatch notifications to nearby citizens when an officer confirms/creates an incident.
 */
export async function notifyNearbyCitizensOnIncidentCreated(incident) {
  if (mongoose.connection?.readyState !== 1) return [];
  try {
    const optedInCitizens = await User.find({
      role: 'citizen',
      'savedLocation.optInAlerts': true,
    }).lean();

    const createdNotifications = [];

    for (const citizen of optedInCitizens) {
      if (!isCitizenNearIncident(citizen.savedLocation, incident)) continue;

      const dedupKey = `incident-created-${incident._id}-${citizen._id}`;

      // Duplicate message prevention
      const existing = await Notification.findOne({ dedupKey }).lean();
      if (existing) continue;

      const area = incident.ward?.name || citizen.savedLocation?.wardName || 'Colombo Basin';
      const warningType = incident.title || 'Operational Hazard Confirmed';

      let emailDelivery = {
        attempted: false,
        sent: false,
        recipientEmail: citizen.savedLocation?.email || '',
        status: 'none',
      };

      if (citizen.savedLocation?.channelEmail && citizen.savedLocation?.email) {
        emailDelivery.attempted = true;
        try {
          const emailRes = await sendWarningEmail({
            to: citizen.savedLocation.email,
            area,
            warningType,
            category: 'officer_confirmed_incident',
            timestamp: new Date(),
            advice: incident.isRoadClosed
              ? 'Corridor closed to vehicular traffic. Check Safe Evacuation Routes for detour options.'
              : 'Emergency responders are actively inspecting and securing the site.',
          });
          emailDelivery.sent = emailRes.success;
          emailDelivery.status = emailRes.status;
          emailDelivery.error = emailRes.error;
          emailDelivery.sentAt = emailRes.sentAt;
        } catch (err) {
          // Never block in-app notification if email transport errors
          emailDelivery.sent = false;
          emailDelivery.status = 'failed';
          emailDelivery.error = err.message || 'Transport error';
        }
      }

      const notif = await Notification.create({
        userId: citizen._id,
        type: 'officer_confirmed_incident',
        title: `🚨 Incident Confirmed: ${warningType}`,
        message: `Emergency responders verified an active hazard in ${area}.${incident.isRoadClosed ? ' Road corridor is closed to traffic.' : ''}`,
        area,
        severity: incident.severity === 'critical' ? 'danger' : incident.severity === 'severe' ? 'warning' : 'info',
        source: 'Operations Officer Verification',
        incidentId: incident._id,
        read: false,
        dedupKey,
        emailDelivery,
      });

      createdNotifications.push(notif);
    }

    return createdNotifications;
  } catch (err) {
    // Audit error without breaking caller
    console.error('Failed to dispatch incident-created notifications:', err.message);
    return [];
  }
}

/**
 * Dispatch notifications when an incident is closed and road re-opened by field crews.
 */
export async function notifyNearbyCitizensOnIncidentResolved(incident) {
  if (mongoose.connection?.readyState !== 1) return [];
  try {
    const optedInCitizens = await User.find({
      role: 'citizen',
      'savedLocation.optInAlerts': true,
    }).lean();

    const createdNotifications = [];

    for (const citizen of optedInCitizens) {
      if (!isCitizenNearIncident(citizen.savedLocation, incident)) continue;

      const dedupKey = `incident-resolved-${incident._id}-${citizen._id}`;

      // Duplicate prevention
      const existing = await Notification.findOne({ dedupKey }).lean();
      if (existing) continue;

      const area = incident.ward?.name || citizen.savedLocation?.wardName || 'Colombo Basin';
      const warningType = `Hazard Cleared: ${incident.title}`;

      let emailDelivery = {
        attempted: false,
        sent: false,
        recipientEmail: citizen.savedLocation?.email || '',
        status: 'none',
      };

      if (citizen.savedLocation?.channelEmail && citizen.savedLocation?.email) {
        emailDelivery.attempted = true;
        try {
          const emailRes = await sendWarningEmail({
            to: citizen.savedLocation.email,
            area,
            warningType,
            category: 'incident_resolved',
            timestamp: new Date(),
            advice: 'Field crews verified hazard clearance with on-site photo proof. Affected corridors are safe to navigate.',
          });
          emailDelivery.sent = emailRes.success;
          emailDelivery.status = emailRes.status;
          emailDelivery.error = emailRes.error;
          emailDelivery.sentAt = emailRes.sentAt;
        } catch (err) {
          emailDelivery.sent = false;
          emailDelivery.status = 'failed';
          emailDelivery.error = err.message || 'Transport error';
        }
      }

      const notif = await Notification.create({
        userId: citizen._id,
        type: 'incident_resolved',
        title: `✅ Hazard Cleared & Resolved: ${incident.title}`,
        message: `Field crew completed physical clearance in ${area}. Road corridor re-opened and linked reports are marked resolved.`,
        area,
        severity: 'resolved',
        source: 'Field Crew Resolution',
        incidentId: incident._id,
        read: false,
        dedupKey,
        emailDelivery,
      });

      createdNotifications.push(notif);
    }

    return createdNotifications;
  } catch (err) {
    console.error('Failed to dispatch incident-resolved notifications:', err.message);
    return [];
  }
}

/**
 * Dispatch notifications when simulated weather/river alerts trigger for wards.
 */
export async function notifyCitizensOnWeatherAlert(alert) {
  if (mongoose.connection?.readyState !== 1) return [];
  try {
    const optedInCitizens = await User.find({
      role: 'citizen',
      'savedLocation.optInAlerts': true,
    }).lean();

    const createdNotifications = [];
    const alertId = alert._id || alert.title;

    for (const citizen of optedInCitizens) {
      if (!isCitizenNearWeatherAlert(citizen.savedLocation, alert)) continue;

      const dedupKey = `weather-alert-${alertId}-${citizen._id}`;

      // Duplicate prevention
      const existing = await Notification.findOne({ dedupKey }).lean();
      if (existing) continue;

      const area = citizen.savedLocation?.wardName || alert.affectedWards?.join(', ') || 'Kelani Basin';
      const warningType = alert.title || 'Hydrological River Advisory';

      let emailDelivery = {
        attempted: false,
        sent: false,
        recipientEmail: citizen.savedLocation?.email || '',
        status: 'none',
      };

      if (citizen.savedLocation?.channelEmail && citizen.savedLocation?.email) {
        emailDelivery.attempted = true;
        try {
          const emailRes = await sendWarningEmail({
            to: citizen.savedLocation.email,
            area,
            warningType,
            category: 'simulated_weather_warning',
            timestamp: new Date(),
            advice: alert.recommendations?.[0] || 'Monitor water levels closely and check safe evacuation routes.',
          });
          emailDelivery.sent = emailRes.success;
          emailDelivery.status = emailRes.status;
          emailDelivery.error = emailRes.error;
          emailDelivery.sentAt = emailRes.sentAt;
        } catch (err) {
          emailDelivery.sent = false;
          emailDelivery.status = 'failed';
          emailDelivery.error = err.message || 'Transport error';
        }
      }

      const notif = await Notification.create({
        userId: citizen._id,
        type: 'simulated_weather_warning',
        title: `🌦️ [SIMULATED] ${warningType}`,
        message: `River gauge sensor simulation issued a ${alert.severity} advisory affecting ${area}. Simulated demo warning.`,
        area,
        severity: alert.severity || 'warning',
        source: alert.source || 'Kelani River Hydrological Gauge',
        alertId: String(alertId),
        read: false,
        dedupKey,
        emailDelivery,
      });

      createdNotifications.push(notif);
    }

    return createdNotifications;
  } catch (err) {
    console.error('Failed to dispatch weather alert notifications:', err.message);
    return [];
  }
}
