import dotenv from 'dotenv';
dotenv.config();

export const cfg = {
  port: process.env.PORT || 3004,
  mongoUri: process.env.MONGO_URI || 'mongodb://payment-mongo:27017/payment_db',
  serviceName: process.env.SERVICE_NAME || 'payment'
};
