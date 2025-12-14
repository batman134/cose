import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    stock: { type: Number, required: true, default: 0 },
    price: { type: Number, required: true }
  },
  { versionKey: false }
);

export const Product = mongoose.model('Product', productSchema);
