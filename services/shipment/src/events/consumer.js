import amqp from 'amqplib';
import { Shipment } from '../models/shipment.js';
import logger from '../utils/logger.js';

let channel;

async function ensureChannel(uri) {
  if (channel) return channel;
  const conn = await amqp.connect(uri);
  channel = await conn.createChannel();
  return channel;
}

async function publishNotification(uri, eventType, payload) {
  const ch = await ensureChannel(uri);
  const exchange = 'notification_exchange';
  await ch.assertExchange(exchange, 'fanout', { durable: true });
  ch.publish(exchange, '', Buffer.from(JSON.stringify({ eventType, payload, timestamp: Date.now() })));
}

export async function consumeShipmentEvents() {
  const uri = process.env.RABBITMQ_URI || 'amqp://rabbitmq';
  const ch = await ensureChannel(uri);

  const paymentExchange = 'payment_exchange';
  await ch.assertExchange(paymentExchange, 'fanout', { durable: true });
  const q = await ch.assertQueue('', { exclusive: true });
  await ch.bindQueue(q.queue, paymentExchange, '');

    logger.info('Shipment service listening for payment events');

  ch.consume(q.queue, async (msg) => {
    if (!msg || !msg.content) return;
    try {
      const { eventType, payload } = JSON.parse(msg.content.toString());
      if (eventType === 'payment_completed') {
        // create shipment
        await Shipment.create({ orderId: payload.orderId, status: 'created' });
          logger.info({ orderId: payload.orderId }, 'Shipment created for order');

        // notify other services (e.g., notification)
        await publishNotification(uri, 'shipment_created', { orderId: payload.orderId });
      }
    } catch (err) {
        logger.error({ err }, 'Error handling shipment event');
    }
  }, { noAck: true });
}
