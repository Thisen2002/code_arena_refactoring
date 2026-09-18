import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
export const config = {
  mongodbUri: process.env.MONGODB_URI,
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  serveClient: process.env.SERVE_CLIENT === 'true',
};
