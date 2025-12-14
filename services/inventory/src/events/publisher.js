import amqp from 'amqplib';
import logger from '../utils/logger.js';

let channel;

export async function connectRabbitMQ(uri) {
  try {
    const connection = await amqp.connect(uri);
    channel = await connection.createChannel();
    logger.info({ uri }, 'Connected to RabbitMQ (inventory-events)');
  } catch (err) {
    logger.error({ err: err.message }, 'RabbitMQ connection error (inventory-events)');
    process.exit(1);
  }
}

export async function publishEvent(eventType, payload) {
  if (!channel) {
    logger.error('Channel not initialized (inventory-events)');
    return;
  }

  const exchange = 'inventory_exchange';
  await channel.assertExchange(exchange, 'fanout', { durable: true });

  const message = JSON.stringify({ eventType, payload, timestamp: Date.now() });
  channel.publish(exchange, '', Buffer.from(message));

  logger.info({ eventType, payload }, 'Published inventory event');
}
