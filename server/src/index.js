import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
mongoose.set('bufferCommands', false);
const clientDirectory = config.serveClient ? fileURLToPath(new URL('../../client/dist/', import.meta.url)) : undefined;
if (clientDirectory && !existsSync(`${clientDirectory}/index.html`)) {
  console.error('Frontend build is missing. Run npm run build before setting SERVE_CLIENT=true.');
  process.exit(1);
}
const server = createApp({ databaseConfigured: Boolean(config.mongodbUri), clientDirectory }).listen(config.port, config.host);
server.once('listening', () => {
  console.log(`Server listening on port ${config.port}.`);
});
server.on('error', () => {
  console.error('Server could not listen. Check HOST and PORT.');
  void shutdown().finally(() => { process.exitCode = 1; });
});
let retry;
let stopping = false;
async function connect() {
  if (!config.mongodbUri) { console.warn('MONGODB_URI is missing. Report storage is unavailable.'); return; }
  try { await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 5000 }); console.log('Database connected.'); }
  catch { console.warn('Database connection failed. Check local configuration; retrying in 10 seconds.'); if (!stopping) retry = setTimeout(connect, 10000); }
}
void connect();
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(retry);
  server.close();
  await mongoose.disconnect();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
