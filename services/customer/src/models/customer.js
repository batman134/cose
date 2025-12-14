import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  address: String,
  password: { type: String, required: true },
  role: { type: String, enum: ['Admin', 'Customer', 'Staff'], default: 'Customer' },
  createdAt: { type: Date, default: Date.now }
});

export const Customer = mongoose.model('Customer', customerSchema);
