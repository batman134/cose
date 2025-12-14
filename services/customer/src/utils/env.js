import dotenv from 'dotenv';
dotenv.config();

export const cfg = {
  port: process.env.PORT || 3003,
  mongoUri: process.env.MONGO_URI || 'mongodb://customer-mongo:27017/customer_db',
  serviceName: process.env.SERVICE_NAME || 'customer'
};
