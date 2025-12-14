// src/routes/orders.js
import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Order } from '../models/order.js';
import { publishEvent } from '../events/publisher.js';
import { requestWithRetry } from '../utils/httpClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

const CUSTOMER_URL = process.env.CUSTOMER_SERVICE_URL || 'http://customer-service:3003';
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3002';
const PAYMENT_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3004';
// per-service timeouts (ms)
const TIMEOUT_CUSTOMER = 3000;
const TIMEOUT_INVENTORY = 3000;
const TIMEOUT_PAYMENT = 5000;
const TIMEOUT_SHIPMENT = 5000;
const TIMEOUT_NOTIFICATION = 10000;

// Create a new order with synchronous orchestration:
// 1) validate customer
// 2) check inventory stock
// 3) create order
// 4) call payment service to process payment
// 5) if payment fails, cancel order and notify
router.post('/', async (req, res) => {
  try {
    const { customerId, items, total } = req.body;

    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customerId and items are required' });
    }

    // 1) validate customer
    try {
      await requestWithRetry(CUSTOMER_URL, { url: `/api/customers/${customerId}`, method: 'get', timeout: TIMEOUT_CUSTOMER }, { attempts: 4, initialBackoffMs: 1000, jitterPercent: 0.3 });
    } catch (err) {
      logger.warn({ err: err.message, customerId }, 'Customer validation failed');
      return res.status(400).json({ error: 'Invalid customer' });
    }

    // 2) check inventory: call Inventory endpoint per SKU
    try {
      for (const item of items) {
          try {
            const resp = await requestWithRetry(INVENTORY_URL, { url: `/api/items/${encodeURIComponent(item.productId)}`, method: 'get', timeout: TIMEOUT_INVENTORY }, { attempts: 4, initialBackoffMs: 1000, jitterPercent: 0.3 });
            const prod = resp.data;
            if (!prod) return res.status(400).json({ error: `Product ${item.productId} not found` });
            if (prod.stock < item.quantity) {
              return res.status(400).json({ error: `Insufficient stock for ${item.productId}` });
            }
          } catch (err) {
            if (err.response && err.response.status === 404) {
              return res.status(400).json({ error: `Product ${item.productId} not found` });
            }
            if (err.code === 'EOPEN') {
              logger.warn({ productId: item.productId }, 'Inventory circuit is open');
              return res.status(503).json({ error: 'Inventory service overloaded' });
            }
            logger.error({ err: err.message, productId: item.productId }, 'Inventory lookup failed');
            return res.status(503).json({ error: 'Inventory service unavailable' });
          }
      }
    } catch (err) {
      console.error('[order] inventory validation error', err.message);
      return res.status(500).json({ error: 'Inventory validation error' });
    }

    // 3) persist order (pending)
    const order = new Order({
      orderId: uuidv4(),
      customerId,
      items,
      total,
      status: 'pending'
    });

    await order.save();

    // Publish order_created for async consumers (e.g., inventory) to decrement stock
    await publishEvent('order_created', {
      orderId: order.orderId,
      customerId: order.customerId,
      items: order.items,
      total: order.total
    });

    // 4) call payment service to process payment synchronously with resilience features
    try {
      const payResp = await requestWithRetry(
        PAYMENT_URL,
        { url: '/api/payments/process', method: 'post', data: { orderId: order.orderId, amount: total }, timeout: TIMEOUT_PAYMENT },
        { attempts: 4, initialBackoffMs: 1000, jitterPercent: 0.3, breakerConfig: { failureThresholdPercent: 0.5, minRequests: 10, recoveryTimeMs: 30000 } }
      );

      if (payResp?.data?.status === 'completed') {
        order.status = 'paid';
        await order.save();
        logger.info({ orderId: order.orderId }, 'Order paid successfully');
        return res.status(201).json(order);
      }

      // payment processed but returned failure (e.g., 402)
      order.status = 'cancelled';
      await order.save();
      await publishEvent('order_cancelled', { orderId: order.orderId, reason: 'payment_failed' });
      logger.warn({ orderId: order.orderId }, 'Payment failed for order');
      return res.status(402).json({ error: 'Payment failed' });
    } catch (payErr) {
      // If circuit is open or payment service unavailable, fallback: queue payment for later
      if (payErr && payErr.code === 'EOPEN') {
        order.status = 'PENDING_PAYMENT';
        await order.save();
        await publishEvent('payment_pending', { orderId: order.orderId, amount: total });
        logger.warn({ orderId: order.orderId }, 'Payment service circuit open, queued payment for later');
        return res.status(202).json({ order, note: 'Payment queued, status PENDING_PAYMENT' });
      }

      // Other unrecoverable failures: fallback queue as well
      logger.error({ err: payErr.message, orderId: order.orderId }, 'Payment service call failed, queueing payment as fallback');
      order.status = 'PENDING_PAYMENT';
      await order.save();
      await publishEvent('payment_pending', { orderId: order.orderId, amount: total });
      return res.status(202).json({ order, note: 'Payment queued, status PENDING_PAYMENT' });
    }
  } catch (err) {
    console.error('[order-route] Error creating order:', err.message);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Cancel an order (optional feature)
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ orderId: id });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    order.status = 'cancelled';
    await order.save();

    // Publish order_cancelled event
    await publishEvent('order_cancelled', {
      orderId: order.orderId,
      reason
    });

    res.json({ message: 'Order cancelled', order });
  } catch (err) {
    console.error('[order-route] Error cancelling order:', err.message);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

export default router;
