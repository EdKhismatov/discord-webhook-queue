import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { type AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { Channel, ConsumeMessage } from 'amqplib';
import { appConfig } from '../../config';
import { DiscordSendStatus, DiscordService, IDiscordEmbed } from '../discord/discord.service';
import { RABBIT_CONNECTION } from '../rabbit/rabbit.module';
import { WEBHOOK_DLQ, WEBHOOK_DLX, WEBHOOK_QUEUE } from './webhook.service';

const RATE_LIMIT_INTERVAL_MS = Math.ceil(1000 / appConfig.discord.rateLimit);

@Injectable()
export class WebhookProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WebhookProcessor.name);
  private channel: ChannelWrapper;
  private lastSentAt = 0; // timestamp последней отправки

  constructor(
    @Inject(RABBIT_CONNECTION)
    private readonly connection: AmqpConnectionManager,
    private readonly discordService: DiscordService,
  ) {}

  async onModuleInit() {
    this.channel = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        await channel.assertExchange(WEBHOOK_DLX, 'direct', { durable: true });
        await channel.assertQueue(WEBHOOK_DLQ, { durable: true });
        await channel.bindQueue(WEBHOOK_DLQ, WEBHOOK_DLX, WEBHOOK_DLQ);
        await channel.assertQueue(WEBHOOK_QUEUE, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': WEBHOOK_DLX,
            'x-dead-letter-routing-key': WEBHOOK_DLQ,
          },
        });

        // Обрабатываем по одному сообщению за раз!
        await channel.prefetch(1);

        await channel.consume(WEBHOOK_QUEUE, (msg) => this.handleMessage(channel, msg));

        this.logger.log('Webhook processor started');
      },
    });
  }

  async onApplicationShutdown() {
    await this.channel.close();
    this.logger.log('RabbitMQ processor channel closed');
  }

  private async handleMessage(channel: Channel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    const embed = JSON.parse(msg.content.toString()) as IDiscordEmbed;

    this.logger.log(`Processing webhook: ${embed.title}`);

    // Ждём чтобы не превысить rate limit
    await this.waitForRateLimit();

    const result = await this.discordService.sendWebhook(embed);

    switch (result.status) {
      case DiscordSendStatus.SUCCESS:
        // Успех — подтверждаем сообщение
        channel.ack(msg);
        this.lastSentAt = Date.now();
        this.logger.log(`Webhook sent: ${embed.title}`);
        break;

      case DiscordSendStatus.RATE_LIMITED:
        // 429 — возвращаем в очередь и ждём
        channel.nack(msg, false, true); // requeue = true
        const waitMs = (result.retryAfter ?? 1) * 1000;
        this.logger.warn(`Rate limited, waiting ${waitMs}ms`);
        await this.sleep(waitMs);
        break;

      case DiscordSendStatus.INVALID_WEBHOOK:
        // 400 — отправляем в DLQ
        channel.nack(msg, false, false); // requeue = false → идёт в DLX/DLQ
        this.logger.error(`Invalid webhook sent to DLQ: ${embed.title}`);
        break;

      case DiscordSendStatus.ERROR:
        // Неожиданная ошибка — возвращаем в очередь
        channel.nack(msg, false, true);
        await this.sleep(1000);
        break;
    }
  }

  // Ждём нужное время чтобы не превысить 2 вебхука в секунду
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastSentAt;
    const waitTime = RATE_LIMIT_INTERVAL_MS - elapsed;

    if (waitTime > 0) {
      this.logger.debug(`Rate limit wait: ${waitTime}ms`);
      await this.sleep(waitTime);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
