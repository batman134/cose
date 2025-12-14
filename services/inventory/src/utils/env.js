import dotenv from 'dotenv';
dotenv.config();

export const cfg = {
  port: process.env.PORT || 3002,
  mongoUri: process.env.MONGO_URI || 'mongodb://inventory-mongo:27017/inventory_db',
  serviceName: process.env.SERVICE_NAME || 'inventory'
};
