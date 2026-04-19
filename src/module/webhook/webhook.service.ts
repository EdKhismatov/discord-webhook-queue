import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { type AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { Options } from 'amqplib';
import { Channel } from 'amqplib';
import { IDiscordEmbed } from '../discord/discord.service';
import { RABBIT_CONNECTION } from '../rabbit/rabbit.module';
import { setupWebhookTopology, WebhookQueue } from './webhook.topology';

export { WebhookQueue } from './webhook.topology';

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
        await setupWebhookTopology(channel);
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
    await this.channel.sendToQueue(WebhookQueue.QUEUE, embed, {
      deliveryMode: 2,
      messageId: crypto.randomUUID(),
    } as Options.Publish);

    this.logger.log(`Webhook queued: ${embed.title}`);
  }
}
