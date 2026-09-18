import { Router } from 'express';
import { randomBytes, randomInt, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { User } from './models/User.js';
import { Session } from './models/Session.js';
import { sendVerificationCodeEmail } from './services/emailService.js';

const derive = promisify(scrypt);

// Validates Sri Lankan National Identity Card (NIC):
// - Old format: 9 digits followed by 'V' or 'X' (e.g. 123456789V)
// - New format: 12 digits (e.g. 199012345678)
const nicRegex = /^([0-9]{9}[vVxX]|[0-9]{12})$/;

export const credentials = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/),
  password: z.string().min(10).max(128),
}).strict();

export const registrationSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/),
  password: z.string().min(10).max(128),
  confirmPassword: z.string().min(10).max(128).optional(),
  fullName: z.string().trim().max(100).optional().default(''),
  nic: z.string().trim().toUpperCase().optional().default('')
    .refine(val => !val || nicRegex.test(val), {
      message: 'NIC must be a valid Sri Lankan format (e.g., 123456789V or 199012345678).',
    }),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')).default(''),
}).strict().refine(data => !data.confirmPassword || data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, encoded] = (stored || '').split(':');
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, 'hex');
  const actual = await derive(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const digest = token => createHash('sha256').update(token).digest('hex');

function cookieToken(req) {
  const part = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('codearena_session='));
  const value = part?.slice('codearena_session='.length);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

export const publicUser = user => ({
  id: String(user._id),
  username: user.username,
  role: user.role,
  demo: Boolean(user.demo),
  fullName: user.fullName || '',
  nic: user.nic || '',
  email: user.email || '',
  emailVerified: Boolean(user.emailVerified),
  savedLocation: user.savedLocation || null,
});

export async function identify(req, _res, next) {
  const token = cookieToken(req);
  if (token) {
    const session = await Session.findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date() } }).lean();
    if (session) req.user = await User.findById(session.userId).lean();
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}

export const allow = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'Your account cannot perform this action.' });
  next();
};

// Same-origin custom header prevents cross-site form submissions. No CORS is enabled.
export function protectWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'CodeArena') return res.status(403).json({ error: 'Required request protection header is missing.' });
  if (req.get('Origin')) {
    try {
      const originUrl = new URL(req.get('Origin'));
      const host = req.get('Host');
      const isExactMatch = originUrl.host === host;
      const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(originUrl.hostname) &&
                         (host?.includes('localhost') || host?.includes('127.0.0.1') || host?.includes('::1'));
      if (!isExactMatch && !isLocalDev) {
        return res.status(403).json({ error: 'Cross-origin writes are not allowed.' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid request origin.' });
    }
  }
  next();
}

export function authRouter() {
  const router = Router();
  const throttle = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 45,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' },
  });
  const options = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };

  async function issue(req, res, user) {
    const prior = cookieToken(req);
    if (prior) await Session.deleteOne({ tokenHash: digest(prior) });
    const token = randomBytes(32).toString('hex');
    await Session.create({ tokenHash: digest(token), userId: user._id, expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) });
    res.cookie('codearena_session', token, { ...options, maxAge: 12 * 60 * 60 * 1000 });
    return publicUser(user);
  }

  router.get('/me', identify, (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

  router.post('/register', throttle, async (req, res) => {
    // Check if extra role escalation was attempted
    if (req.body?.role) {
      return res.status(400).json({ error: 'No role field is accepted during registration.' });
    }

    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || 'Registration validation failed.';
      return res.status(400).json({ error: firstIssue });
    }

    const { username, password, fullName, nic, email } = parsed.data;

    try {
      await User.init();

      let emailOtp = undefined;
      let emailVerified = false;
      let otpCodeForTest = null;

      if (email) {
        // Generate a 6-digit numeric OTP code
        const code = String(randomInt(100000, 999999));
        otpCodeForTest = code;
        const codeHash = digest(code);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        emailOtp = { codeHash, expiresAt, pendingEmail: email };
        await sendVerificationCodeEmail({ to: email, code, username: fullName || username, purpose: 'registration' });
      }

      const user = await User.create({
        username,
        passwordHash: await hashPassword(password),
        fullName: fullName || '',
        nic: nic || '',
        email: email || '',
        emailVerified,
        emailOtp,
        role: 'citizen',
      });

      const issued = await issue(req, res, user);
      res.status(201).json({
        user: issued,
        requiresVerification: Boolean(email && !emailVerified),
        // Included in development for easy review/testing without checking log files
        demoOtpHint: process.env.NODE_ENV !== 'production' && otpCodeForTest ? otpCodeForTest : undefined,
      });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: 'Username is unavailable.' });
      throw error;
    }
  });

  router.post('/login', throttle, async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Check username and password format.' });
    const user = await User.findOne({ username: parsed.data.username }).select('+passwordHash');
    // Perform the expensive hash even for an unknown username.
    const stored = user?.passwordHash || `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    if (!(await verifyPassword(parsed.data.password, stored)) || !user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    res.json({ user: await issue(req, res, user) });
  });

  router.post('/logout', async (req, res) => {
    const token = cookieToken(req);
    if (token) await Session.deleteOne({ tokenHash: digest(token) });
    res.clearCookie('codearena_session', options).json({ ok: true });
  });

  // Verify 6-digit email OTP
  router.post('/verify-email', identify, requireUser, async (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (!/^[0-9]{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter a valid 6-digit verification code.' });
    }

    const user = await User.findById(req.user._id).select('+emailOtp.codeHash +emailOtp.expiresAt +emailOtp.pendingEmail');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (!user.emailOtp?.codeHash || !user.emailOtp?.expiresAt) {
      return res.status(400).json({ error: 'No active verification code found.' });
    }

    if (new Date() > new Date(user.emailOtp.expiresAt)) {
      return res.status(400).json({ error: 'Verification code has expired. Request a new one.' });
    }

    const hashedInput = digest(code);
    if (hashedInput !== user.emailOtp.codeHash) {
      return res.status(400).json({ error: 'Incorrect verification code. Please check and try again.' });
    }

    // Code matches
    if (user.emailOtp.pendingEmail) {
      user.email = user.emailOtp.pendingEmail;
    }
    user.emailVerified = true;
    user.emailOtp = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email successfully verified.',
      user: publicUser(user),
    });
  });

  // Resend 6-digit email OTP
  router.post('/resend-code', identify, requireUser, throttle, async (req, res) => {
    const user = await User.findById(req.user._id).select('+emailOtp.pendingEmail');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const targetEmail = user.emailOtp?.pendingEmail || user.email;
    if (!targetEmail) {
      return res.status(400).json({ error: 'No email address registered to verify.' });
    }

    const code = String(randomInt(100000, 999999));
    const codeHash = digest(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    user.emailOtp = { codeHash, expiresAt, pendingEmail: targetEmail };
    await user.save();

    await sendVerificationCodeEmail({
      to: targetEmail,
      code,
      username: user.fullName || user.username,
      purpose: user.emailVerified ? 'profile_update' : 'registration',
    });

    res.json({
      success: true,
      message: `A new verification code has been sent to ${targetEmail}.`,
      demoOtpHint: process.env.NODE_ENV !== 'production' ? code : undefined,
    });
  });

  // Universal profile details
  router.get('/profile', identify, requireUser, async (req, res) => {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ profile: publicUser(user) });
  });

  // Update profile: full name, email (with optional OTP flow)
  // Username and role CANNOT be changed
  router.patch('/profile', identify, requireUser, async (req, res) => {
    if (req.body?.username || req.body?.role) {
      return res.status(400).json({ error: 'Username and role are fixed and cannot be changed.' });
    }

    const profileSchema = z.object({
      fullName: z.string().trim().max(100).optional(),
      email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
      nic: z.string().trim().toUpperCase().optional()
        .refine(val => !val || nicRegex.test(val), {
          message: 'NIC must be a valid Sri Lankan format (e.g. 123456789V or 199012345678).',
        }),
    }).strict();

    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile information.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    let requiresVerification = false;
    let demoOtpHint = undefined;

    if (parsed.data.fullName !== undefined) {
      user.fullName = parsed.data.fullName;
    }

    // Citizens can update NIC if not previously set or updating format
    if (parsed.data.nic !== undefined && (!user.nic || user.role === 'citizen')) {
      user.nic = parsed.data.nic;
    }

    // Email update
    if (parsed.data.email !== undefined && parsed.data.email !== user.email) {
      const newEmail = parsed.data.email;
      if (newEmail) {
        const code = String(randomInt(100000, 999999));
        demoOtpHint = code;
        const codeHash = digest(code);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        user.emailOtp = { codeHash, expiresAt, pendingEmail: newEmail };
        requiresVerification = true;
        await sendVerificationCodeEmail({
          to: newEmail,
          code,
          username: user.fullName || user.username,
          purpose: 'profile_update',
        });
      } else {
        user.email = '';
        user.emailVerified = false;
        user.emailOtp = undefined;
      }
    }

    await user.save();
    res.json({
      success: true,
      message: requiresVerification
        ? 'Profile updated. A 6-digit verification code was sent to your new email.'
        : 'Profile updated successfully.',
      profile: publicUser(user),
      requiresVerification,
      demoOtpHint: process.env.NODE_ENV !== 'production' && demoOtpHint ? demoOtpHint : undefined,
    });
  });

  // Change password endpoint for any logged-in role
  router.post('/change-password', identify, requireUser, throttle, async (req, res) => {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required.'),
      newPassword: z.string().min(10, 'New password must be at least 10 characters.').max(128),
      confirmNewPassword: z.string().min(10, 'Please confirm your new password.'),
    }).strict().refine(data => data.newPassword === data.confirmNewPassword, {
      message: 'New passwords do not match.',
      path: ['confirmNewPassword'],
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Check password details.' });
    }

    const { currentPassword, newPassword } = parsed.data;
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    res.json({ success: true, message: 'Password successfully updated.' });
  });

  return router;
}

