import amqp from 'amqplib';
import { Product } from '../models/Product.js';
import { publishEvent } from './publisher.js';
import logger from '../utils/logger.js';

export async function consumeOrderEvents(uri) {
  const connection = await amqp.connect(uri || process.env.RABBITMQ_URI || 'amqp://rabbitmq');
  const channel = await connection.createChannel();

  const exchange = 'order_exchange';
  await channel.assertExchange(exchange, 'fanout', { durable: true });

  const q = await channel.assertQueue('', { exclusive: true });
  channel.bindQueue(q.queue, exchange, '');

  logger.info('Waiting for order events (inventory)');

  channel.consume(q.queue, async (msg) => {
    if (msg && msg.content) {
      const { eventType, payload } = JSON.parse(msg.content.toString());
      logger.info({ eventType, payload }, 'Received order event (inventory)');

      try {
        if (eventType === 'order_created') {
          for (const item of payload.items) {
            const product = await Product.findOne({ sku: item.productId });
            if (product) {
              product.stock -= item.quantity;
              await product.save();

              await publishEvent('inventory_updated', {
                sku: product.sku,
                newStock: product.stock
              });
            }
          }
        }

        if (eventType === 'order_cancelled') {
          for (const item of payload.items || []) {
            const product = await Product.findOne({ sku: item.productId });
            if (product) {
              product.stock += item.quantity;
              await product.save();

              await publishEvent('inventory_updated', {
                sku: product.sku,
                newStock: product.stock
              });
            }
          }
        }
      } catch (err) {
        logger.error({ err: err.message }, 'Error processing inventory event');
      }
    }
  }, { noAck: true });
}
