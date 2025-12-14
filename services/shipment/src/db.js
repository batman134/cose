import mongoose from 'mongoose';
import logger from './utils/logger.js';

export async function connectDB(uri) {
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('Shipment MongoDB connected');
  } catch (err) {
    logger.error({ err }, 'Shipment MongoDB connection error');
    process.exit(1);
  }
}

export default connectDB;
