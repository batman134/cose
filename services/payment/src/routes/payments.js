import express from 'express';
import { Payment } from '../models/payment.js';
import amqp from 'amqplib';
import logger from '../utils/logger.js';

async function publishPaymentEvent(uri, eventType, payload) {
  try {
    const conn = await amqp.connect(uri || process.env.RABBITMQ_URI || 'amqp://rabbitmq');
    const ch = await conn.createChannel();
    const exchange = 'payment_exchange';
    await ch.assertExchange(exchange, 'fanout', { durable: true });
    ch.publish(exchange, '', Buffer.from(JSON.stringify({ eventType, payload, timestamp: Date.now() })));
    await ch.close();
    await conn.close();
    logger.info({ eventType, payload }, 'payment published');
  } catch (err) {
    logger.error({ err: err.message }, 'payment publish error');
  }
}

const router = express.Router();

let forceFail = false;
let forceDelayMs = 0;

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// Debug endpoint: toggle failure or delay for testing
router.post('/debug/fail', (req, res) => {
  try {
    forceFail = !!req.body.forceFail;
    forceDelayMs = Number(req.body.delayMs) || 0;
    return res.json({ forceFail, forceDelayMs });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to set debug fail');
    return res.status(400).json({ error: 'invalid body' });
  }
});

// list payments
router.get('/', async (req, res) => {
  const payments = await Payment.find();
  res.json(payments);
});

// create payment manually (optional)
router.post('/', async (req, res) => {
    try {
      const payment = await Payment.create(req.body);
      res.status(201).json(payment);
    } catch (err) {
      logger.error({ err: err.message }, 'create payment error');
      res.status(400).json({ error: err.message });
    }
});

// process payment synchronously (called by Order Service)
router.post('/process', async (req, res) => {
    try {
      const { orderId, amount } = req.body;
      if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });
      // simulate debug failure or delay
      if (forceDelayMs > 0) {
        await sleep(forceDelayMs);
      }
      if (forceFail) {
        logger.warn('Payment debug mode: forcing 500 error');
        return res.status(500).json({ error: 'forced failure for testing' });
      }
      const payment = await Payment.create({ orderId, amount, method: 'card', status: 'initiated' });

      // simulate payment processing
      const success = true; // TODO: integrate real gateway

      if (success) {
        payment.status = 'completed';
        await payment.save();
        // publish payment_completed
        await publishPaymentEvent(process.env.RABBITMQ_URI, 'payment_completed', { orderId, paymentId: payment._id, amount });
        return res.json({ status: 'completed', paymentId: payment._id });
      }

      payment.status = 'failed';
      await payment.save();
      await publishPaymentEvent(process.env.RABBITMQ_URI, 'payment_failed', { orderId, paymentId: payment._id, amount });
      return res.status(402).json({ status: 'failed' });
    } catch (err) {
      logger.error({ err: err.message }, 'payment process error');
      res.status(500).json({ error: 'Payment processing failed' });
    }
});

export default router;
