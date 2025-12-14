import dotenv from 'dotenv';
dotenv.config();

export const cfg = {
  port: process.env.PORT || 3001,
  mongoUri: process.env.MONGO_URI || 'mongodb://order-mongo:27017/order_db',
  serviceName: process.env.SERVICE_NAME || 'order'
};
