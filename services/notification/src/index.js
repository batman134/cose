import express from 'express';
import dotenv from 'dotenv';
import expressPino from 'express-pino-logger';
import { consumeNotificationEvents } from './events/consumer.js';
import connectDB from './db.js';
import logger from './utils/logger.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(expressPino({ logger }));

app.get('/health', (req, res) => {
  res.json({ service: 'notification', status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, async () => {
  await connectDB(process.env.MONGO_URI || 'mongodb://mongo-notification:27017/notification');
  await consumeNotificationEvents();
  logger.info({ port: PORT }, 'Notification service listening');
});

