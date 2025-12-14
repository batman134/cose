import express from 'express';
import dotenv from 'dotenv';
import expressPino from 'express-pino-logger';
import shipmentRoutes from './routes/shipments.js';
import { consumeShipmentEvents } from './events/consumer.js';
import connectDB from './db.js';
import logger from './utils/logger.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(expressPino({ logger }));

app.use('/api/shipments', shipmentRoutes);

app.get('/health', (req, res) => {
  res.json({ service: 'shipment', status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, async () => {
  await connectDB(process.env.MONGO_URI || 'mongodb://mongo-shipment:27017/shipment');
  await consumeShipmentEvents();
  logger.info({ port: PORT }, 'Shipment service listening');
});
