import express from 'express';
import logger from '../utils/logger.js';
import { Product } from '../models/Product.js';

const router = express.Router();

// Create a new product
router.post('/', async (req, res) => {
  try {
    const { sku, name, stock, price } = req.body;
    const product = new Product({ sku, name, stock, price });
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    logger.error({ err: err.message }, 'Error creating product');
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    logger.error({ err: err.message }, 'Error fetching products');
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get product by SKU
router.get('/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const product = await Product.findOne({ sku });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    logger.error({ err: err.message }, 'Error fetching product');
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

export default router;
