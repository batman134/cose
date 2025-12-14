import mongoose from 'mongoose';
import logger from './utils/logger.js';

export async function connectDB(uri) {
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.info({ service: 'inventory' }, 'Connected to MongoDB');
  } catch (err) {
    logger.error({ err: err.message }, 'MongoDB connection error');
    process.exit(1);
  }
}
