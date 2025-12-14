import amqp from 'amqplib';
import { Payment } from '../models/payment.js';
import logger from '../utils/logger.js';

let channel;

async function ensureChannel(uri) {
  if (channel) return channel;
  const conn = await amqp.connect(uri);
  channel = await conn.createChannel();
  return channel;
}

async function publishPaymentEvent(uri, eventType, payload) {
  const ch = await ensureChannel(uri);
  const exchange = 'payment_exchange';
  await ch.assertExchange(exchange, 'fanout', { durable: true });
  const msg = JSON.stringify({ eventType, payload, timestamp: Date.now() });
  ch.publish(exchange, '', Buffer.from(msg));
  logger.info({ eventType, payload }, 'Published payment event');
}

/**
 * Consumes order events from `order_exchange` and processes payments.
 */
export async function consumeOrderEvents() {
  try {
    const uri = process.env.RABBITMQ_URI || 'amqp://rabbitmq';
    const ch = await ensureChannel(uri);

    const orderExchange = 'order_exchange';
    await ch.assertExchange(orderExchange, 'fanout', { durable: true });

    const q = await ch.assertQueue('', { exclusive: true });
    await ch.bindQueue(q.queue, orderExchange, '');

    logger.info('Payment service waiting for order events...');

    ch.consume(q.queue, async (msg) => {
      if (!msg || !msg.content) return;
      try {
        const { eventType, payload } = JSON.parse(msg.content.toString());
        logger.info({ eventType, orderId: payload?.orderId || payload?._id }, 'Received order event');

        if (eventType === 'order_created') {
          // create payment record (initiated)
          const payment = await Payment.create({
            orderId: payload.orderId || payload._id,
            amount: payload.total || payload.amount,
            method: 'card',
            status: 'initiated'
          });

          // Simulate processing (synchronous for now)
          const success = true; // TODO: add real processing / retries

          if (success) {
            payment.status = 'completed';
            await payment.save();

            await publishPaymentEvent(uri, 'payment_completed', {
              orderId: payment.orderId,
              paymentId: payment._id,
              amount: payment.amount
            });
          } else {
            payment.status = 'failed';
            await payment.save();

            await publishPaymentEvent(uri, 'payment_failed', {
              orderId: payment.orderId,
              paymentId: payment._id,
              amount: payment.amount
            });
          }
        }

        if (eventType === 'payment_pending') {
          // queue based fallback: attempt to process a pending payment
          try {
            const payment = await Payment.create({
              orderId: payload.orderId,
              amount: payload.amount,
              method: 'card',
              status: 'initiated'
            });

            // Attempt to process (same logic as for order_created)
            const success = true; // TODO: integrate real gateway & retry here
            if (success) {
              payment.status = 'completed';
              await payment.save();
              await publishPaymentEvent(uri, 'payment_completed', { orderId: payment.orderId, paymentId: payment._id, amount: payment.amount });
            } else {
              payment.status = 'failed';
              await payment.save();
              await publishPaymentEvent(uri, 'payment_failed', { orderId: payment.orderId, paymentId: payment._id, amount: payment.amount });
            }
          } catch (pendErr) {
            logger.error({ err: pendErr.message }, 'Failed to process payment_pending');
          }
        }
      } catch (procErr) {
        logger.error({ err: procErr.message }, 'Failed processing payment message');
      }
    }, { noAck: true });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to consume payment events');
  }
}
