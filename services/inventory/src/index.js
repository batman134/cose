import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import itemRoutes from './routes/items.js';
import { consumeOrderEvents } from './events/consumer.js';
import expressPino from 'express-pino-logger';
import logger from './utils/logger.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(expressPino({ logger }));

// routes
app.use('/api/items', itemRoutes);

// health check
app.get('/health', (req, res) => {
  res.json({ service: 'inventory', status: 'ok', timestamp: new Date() });
});

// connect DB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info({ service: 'inventory' }, 'MongoDB connected');
  } catch (err) {
    logger.error({ err: err.message }, 'MongoDB connection error');
    process.exit(1);
  }
};

const PORT = process.env.PORT || 3002;
app.listen(PORT, async () => {
  await connectDB();
  logger.info({ port: PORT }, 'Inventory service listening');

  // start consuming RabbitMQ events
  consumeOrderEvents(process.env.RABBITMQ_URI);
});
