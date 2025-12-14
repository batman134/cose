// src/index.js
import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import ordersRouter from './routes/orders.js';
import debugRouter from './routes/debug.js';
import { connectDB } from './db.js';
import { connectRabbitMQ } from './events/publisher.js';
import expressPino from 'express-pino-logger';
import logger from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(morgan('dev'));
app.use(expressPino({ logger }));

// Routes
app.use('/api/orders', ordersRouter);
app.use('/debug', debugRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Order Service healthy' });
});

// Start server
async function start() {
  await connectDB(process.env.MONGO_URI);
  await connectRabbitMQ(process.env.RABBITMQ_URI);

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Order service running');
  });
}

start();
