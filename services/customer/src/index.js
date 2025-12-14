import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import customerRoutes from './routes/customers.js';
import expressPino from 'express-pino-logger';
import logger from './utils/logger.js';
import authRoutes from './routes/auth.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(expressPino({ logger }));

// routes
app.use('/api/customers', customerRoutes);
app.use('/auth', authRoutes);

// health check
app.get('/health', (req, res) => {
  res.json({ service: 'customer', status: 'ok', timestamp: new Date() });
});

// connect DB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info({ service: 'customer' }, 'MongoDB connected');
  } catch (err) {
    logger.error({ err: err.message }, 'MongoDB connection error');
    process.exit(1);
  }
};

const PORT = process.env.PORT || 3003;
app.listen(PORT, async () => {
  await connectDB();
  logger.info({ port: PORT }, 'Customer service listening');
});
