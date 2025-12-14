import mongoose from 'mongoose';
import { cfg } from './utils/env.js';
import logger from './utils/logger.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
      logger.info({ service: cfg.serviceName }, 'MongoDB connected');
  });
  mongoose.connection.on('error', (err) => {
      logger.error({ err: err.message }, 'MongoDB connection error');
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn({ service: cfg.serviceName }, 'MongoDB disconnected');
  });

  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(cfg.mongoUri, { autoIndex: true });
      return;
    } catch (err) {
      logger.warn({ attempt, err: err.message }, 'DB connect attempt failed');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw new Error(`[${cfg.serviceName}] Failed to connect to MongoDB after ${maxAttempts} attempts`);
}
