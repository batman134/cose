import mongoose from 'mongoose';

const shipmentSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export const Shipment = mongoose.model('Shipment', shipmentSchema);
