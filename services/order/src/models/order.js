// src/models/order.js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true
    },
    customerId: {
      type: String,
      required: true
    },
    items: [
      {
        productId: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }
      }
    ],
    total: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'cancelled', 'paid', 'shipped', 'delivered'],
      default: 'pending'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { versionKey: false }
);

export const Order = mongoose.model('Order', orderSchema);
