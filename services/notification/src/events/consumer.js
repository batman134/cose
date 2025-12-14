import amqp from 'amqplib';
import { Notification } from '../models/notification.js';
import logger from '../utils/logger.js';

let channel;

async function ensureChannel(uri) {
  if (channel) return channel;
  const conn = await amqp.connect(uri);
  channel = await conn.createChannel();
  return channel;
}

export async function consumeNotificationEvents() {
  try {
    const uri = process.env.RABBITMQ_URI || 'amqp://rabbitmq';
    const ch = await ensureChannel(uri);

    const exchanges = ['payment_exchange', 'notification_exchange', 'order_exchange'];
    for (const ex of exchanges) {
      await ch.assertExchange(ex, 'fanout', { durable: true });
    }

    const q = await ch.assertQueue('', { exclusive: true });
    for (const ex of exchanges) {
      await ch.bindQueue(q.queue, ex, '');
    }

    logger.info({ exchanges }, 'Notification service listening for events');

    ch.consume(q.queue, async (msg) => {
      if (!msg || !msg.content) return;
      try {
        const { eventType, payload } = JSON.parse(msg.content.toString());
        logger.info({ eventType, payload }, 'Notification event received');

        let note = null;
        if (eventType === 'payment_completed') {
          note = await Notification.create({
            type: 'payment',
            to: payload.email || payload.customerId || '',
            message: `Payment received for order ${payload.orderId}`,
            metadata: payload
          });
        } else if (eventType === 'shipment_created') {
          note = await Notification.create({
            type: 'shipment',
            to: payload.email || payload.customerId || '',
            message: `Shipment started for order ${payload.orderId}`,
            metadata: payload
          });
        } else if (eventType === 'order_created') {
          note = await Notification.create({
            type: 'order',
            to: payload.email || payload.customerId || payload.orderId || '',
            message: `Order ${payload.orderId || payload._id} created`,
            metadata: payload
          });
        }

        if (note) logger.info({ notificationId: note._id }, 'Saved notification');
      } catch (err) {
        logger.error({ err }, 'Failed processing notification message');
      }
    }, { noAck: true });
  } catch (err) {
    logger.error({ err }, 'Notification consumer init error');
    process.exit(1);
  }
}
