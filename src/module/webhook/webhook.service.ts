import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { type AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { Options } from 'amqplib';
import { Channel } from 'amqplib';
import { IDiscordEmbed } from '../discord/discord.service';
import { RABBIT_CONNECTION } from '../rabbit/rabbit.module';

export const WEBHOOK_QUEUE = 'webhook.queue';
export const WEBHOOK_DLQ = 'webhook.dlq';
export const WEBHOOK_DLX = 'webhook.dlx';

@Injectable()
export class WebhookService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WebhookService.name);
  private channel: ChannelWrapper;

  constructor(
    @Inject(RABBIT_CONNECTION)
    private readonly connection: AmqpConnectionManager,
  ) {}

  async onModuleInit() {
    this.channel = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        // DLX — Dead Letter Exchange
        await channel.assertExchange(WEBHOOK_DLX, 'direct', {
          durable: true,
        });

        // DLQ — Dead Letter Queue (для невалидных вебхуков 400)
        await channel.assertQueue(WEBHOOK_DLQ, {
          durable: true,
        });

        await channel.bindQueue(WEBHOOK_DLQ, WEBHOOK_DLX, WEBHOOK_DLQ);

        // Основная очередь с привязкой к DLX
        await channel.assertQueue(WEBHOOK_QUEUE, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': WEBHOOK_DLX,
            'x-dead-letter-routing-key': WEBHOOK_DLQ,
          },
        });

        this.logger.log('RabbitMQ queues initialized');
      },
    });

    await this.channel.waitForConnect();
    this.logger.log('RabbitMQ channel ready');
  }

  async onApplicationShutdown() {
    await this.channel.close();
    this.logger.log('RabbitMQ channel closed');
  }

  async publish(embed: IDiscordEmbed): Promise<void> {
    await this.channel.sendToQueue(WEBHOOK_QUEUE, embed, {
      deliveryMode: 2,
      messageId: crypto.randomUUID(),
    } as Options.Publish);

    this.logger.log(`Webhook queued: ${embed.title}`);
  }
}
