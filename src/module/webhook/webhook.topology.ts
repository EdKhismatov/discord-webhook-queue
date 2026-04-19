import { Channel } from 'amqplib';

export enum WebhookQueue {
  QUEUE = 'webhook.queue',
  DLQ = 'webhook.dlq',
  DLX = 'webhook.dlx',
}

export async function setupWebhookTopology(channel: Channel): Promise<void> {
  // DLX — Dead Letter Exchange
  await channel.assertExchange(WebhookQueue.DLX, 'direct', { durable: true });

  // DLQ — Dead Letter Queue (для невалидных вебхуков 400)
  await channel.assertQueue(WebhookQueue.DLQ, { durable: true });
  await channel.bindQueue(WebhookQueue.DLQ, WebhookQueue.DLX, WebhookQueue.DLQ);

  // Основная очередь с привязкой к DLX
  await channel.assertQueue(WebhookQueue.QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': WebhookQueue.DLX,
      'x-dead-letter-routing-key': WebhookQueue.DLQ,
    },
  });
}