import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import paymentRoutes from './routes/payments.js';
import metrics from './utils/metrics.js';
import { consumeOrderEvents } from './events/consumer.js';
import expressPino from 'express-pino-logger';
import logger from './utils/logger.js';

dotenv.config();
const app = express();
app.use(express.json());
// Prometheus metrics middleware
app.use(metrics.metricsMiddleware);
app.use(expressPino({ logger }));

// routes
app.use('/api/payments', paymentRoutes);

// health check
app.get('/health', (req, res) => {
  res.json({ service: 'payment', status: 'ok', timestamp: new Date() });
});

// Expose Prometheus metrics
app.get('/metrics', metrics.metricsHandler);

// connect DB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info({ service: 'payment' }, 'MongoDB connected');
  } catch (err) {
    logger.error({ err: err.message }, 'MongoDB connection error');
    process.exit(1);
  }
};

const PORT = process.env.PORT || 3004;
app.listen(PORT, async () => {
  await connectDB();
  logger.info({ port: PORT }, 'Payment service listening');

  // start consuming RabbitMQ events
  consumeOrderEvents(process.env.RABBITMQ_URI);
});
