// Optional Email Delivery Channel for Saved Location Warnings
// Strictly enforces privacy: includes area, warning type, timestamp, and details link.
// NEVER includes private citizen report descriptions, photos, or exact GPS coordinates.
// Non-blocking: failures are logged and recorded without interrupting warning pipelines.

const sentEmails = [];
const MAX_OUTBOX_SIZE = 50;

/**
 * Send warning advisory email to citizen's opted-in address.
 * 
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.area - Affected ward / corridor name
 * @param {string} options.warningType - Descriptive warning title
 * @param {'simulated_weather_warning'|'officer_confirmed_incident'|'incident_resolved'} options.category - Notification category
 * @param {Date} [options.timestamp] - Issuance timestamp
 * @param {string} [options.detailsUrl] - URL to citizen dashboard
 * @param {string} [options.advice] - General civil defence guidance
 * @returns {Promise<{ success: boolean, status: 'sent'|'failed'|'skipped', error?: string, sentAt?: Date }>}
 */
export async function sendWarningEmail({
  to,
  area,
  warningType,
  category,
  timestamp = new Date(),
  detailsUrl = 'http://127.0.0.1:5173/#citizen',
  advice = 'Review safe evacuation routes and avoid affected low-lying corridors.',
}) {
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return { success: false, status: 'failed', error: 'Invalid or missing recipient email address.' };
  }

  try {
    const isSimulated = category === 'simulated_weather_warning';
    const isResolved = category === 'incident_resolved';

    const subjectPrefix = isSimulated
      ? '[SIMULATED FLOOD WARNING]'
      : isResolved
      ? '[HAZARD RESOLVED]'
      : '[OFFICIAL INCIDENT NOTICE]';

    const subject = `${subjectPrefix} ${warningType} — ${area}`;

    const textBody = [
      `DISASTER RESPONSE EMERGENCY ADVISORY`,
      `====================================`,
      ``,
      `Classification: ${isSimulated ? 'SIMULATED HYDROLOGICAL MONITOR (Demonstration Feed)' : isResolved ? 'OFFICIAL FIELD CREW RESOLUTION' : 'OFFICIAL RESPONDER CONFIRMATION'}`,
      `Affected Area:  ${area}`,
      `Warning Type:   ${warningType}`,
      `Issued At:      ${timestamp.toISOString()}`,
      `Guidance:       ${advice}`,
      ``,
      `View Live Updates & Detour Routes:`,
      `${detailsUrl}`,
      ``,
      `------------------------------------`,
      `Privacy & Safety Notice:`,
      `This message contains only corridor-level public hazard information.`,
      `Visual attachments, individual citizen submissions, and precise device coordinates are omitted for privacy.`,
      isSimulated ? `DEMONSTRATION ONLY: This warning was generated from a simulated river gauge replay.` : `In an actual emergency, follow directions from local municipal authorities.`,
    ].join('\n');

    const record = {
      to: to.toLowerCase().trim(),
      subject,
      category,
      area,
      warningType,
      textBody,
      sentAt: new Date(),
    };

    sentEmails.unshift(record);
    if (sentEmails.length > MAX_OUTBOX_SIZE) {
      sentEmails.pop();
    }

    return {
      success: true,
      status: 'sent',
      recipient: record.to,
      subject,
      sentAt: record.sentAt,
    };
  } catch (err) {
    return {
      success: false,
      status: 'failed',
      error: err.message || 'Email delivery transport failure.',
    };
  }
}

/**
 * Send 6-digit email verification code.
 * 
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.code
 * @param {string} [options.username]
 * @param {'registration'|'profile_update'} [options.purpose]
 */
export async function sendVerificationCodeEmail({
  to,
  code,
  username = 'Citizen',
  purpose = 'registration',
}) {
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return { success: false, status: 'failed', error: 'Invalid or missing email address.' };
  }

  try {
    const subject = `[Resilient Lanka] Your 6-digit verification code: ${code}`;
    const textBody = [
      `RESILIENT LANKA · DISASTER RESPONSE PLATFORM`,
      `==========================================`,
      ``,
      `Hello ${username},`,
      ``,
      `Your verification code for account ${purpose === 'registration' ? 'registration' : 'email update'} is:`,
      ``,
      `   ${code}`,
      ``,
      `This code will expire in 15 minutes. If you did not request this code, you can safely disregard this message.`,
      ``,
      `------------------------------------------`,
      `Platform Security Notice:`,
      `Resilient Lanka will never ask for your password or verification code in an unsolicited phone call or chat.`,
    ].join('\n');

    const record = {
      to: to.toLowerCase().trim(),
      subject,
      category: 'email_verification',
      warningType: 'Email Verification OTP',
      area: 'N/A',
      code,
      textBody,
      sentAt: new Date(),
    };

    sentEmails.unshift(record);
    if (sentEmails.length > MAX_OUTBOX_SIZE) {
      sentEmails.pop();
    }

    return {
      success: true,
      status: 'sent',
      recipient: record.to,
      code,
      sentAt: record.sentAt,
    };
  } catch (err) {
    return {
      success: false,
      status: 'failed',
      error: err.message || 'Failed to dispatch verification email.',
    };
  }
}

/**
 * Inspection helper for automated tests and verification
 */
export function getSentEmails() {
  return [...sentEmails];
}

/**
 * Clear email outbox between test runs
 */
export function clearSentEmails() {
  sentEmails.length = 0;
}
