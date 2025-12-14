// src/db.js
import mongoose from 'mongoose';

export async function connectDB(uri) {
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('[order-db] Connected to MongoDB');
  } catch (err) {
    console.error('[order-db] MongoDB connection error:', err.message);
    process.exit(1);
  }
}
