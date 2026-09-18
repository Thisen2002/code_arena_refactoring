import '../src/config.js';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { User, roles } from '../src/models/User.js';
import { hashPassword } from '../src/auth.js';

// These are clearly labelled demonstration identities, never a public role switch.
const directory = new URL('../generated/', import.meta.url);
const file = new URL('demo-accounts.json', directory);
try {
  if (!process.env.MONGODB_URI) throw new Error('Missing configuration.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await User.init();
  await mkdir(directory, { recursive: true });
  let accounts = [];
  try { accounts = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const DEMO_PASSWORD = 'password123';
  for (const role of roles) {
    const username = `demo-${role}`;
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const existing = await User.findOne({ username });
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.isRestricted = false;
      await existing.save();
    } else {
      await User.create({ username, role, demo: true, passwordHash });
    }
    accounts = accounts.filter(a => a.username !== username);
    accounts.push({ username, role, password: DEMO_PASSWORD });
    await writeFile(file, JSON.stringify(accounts, null, 2) + '\n', { mode: 0o600 });
  }
  console.log('Demo accounts are ready with simple passwords. Read server/generated/demo-accounts.json.');
} catch { console.error('Demo account setup failed. Check MongoDB and the local credential file; details suppressed.'); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
