import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'card' },
  status: { type: String, default: 'initiated' },
  createdAt: { type: Date, default: Date.now }
});

export const Payment = mongoose.model('Payment', paymentSchema);
