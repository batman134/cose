// src/events/publisher.js
import amqp from 'amqplib';
import logger from '../utils/logger.js';

let channel;

export async function connectRabbitMQ(uri) {
  try {
    const connection = await amqp.connect(uri);
    channel = await connection.createChannel();
    logger.info({ uri }, 'Connected to RabbitMQ (order-events)');
  } catch (err) {
    logger.error({ err: err.message }, 'RabbitMQ connection error (order-events)');
    process.exit(1);
  }
}

export async function publishEvent(eventType, payload) {
  if (!channel) {
    logger.error('Channel not initialized for order-events');
    return;
  }

  const exchange = 'order_exchange';
  await channel.assertExchange(exchange, 'fanout', { durable: true });

  const message = JSON.stringify({ eventType, payload, timestamp: Date.now() });
  channel.publish(exchange, '', Buffer.from(message));

  logger.info({ eventType, payload }, 'Published order event');
}
