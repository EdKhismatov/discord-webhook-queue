import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { type AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { Channel, ConsumeMessage } from 'amqplib';
import { appConfig } from '../../config';
import { DiscordHook } from '../database/entities/discord-hook.model';
import { DiscordSendStatus, DiscordService, IDiscordEmbed } from '../discord/discord.service';
import { RABBIT_CONNECTION } from '../rabbit/rabbit.module';
import { setupWebhookTopology, WebhookQueue } from './webhook.topology';

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
    @InjectModel(DiscordHook)
    private readonly discordHookModel: typeof DiscordHook,
  ) {}

  async onModuleInit() {
    this.channel = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        await setupWebhookTopology(channel);

        // Обрабатываем по одному сообщению за раз!
        await channel.prefetch(1);

        await channel.consume(WebhookQueue.QUEUE, (msg) => this.handleMessage(channel, msg));

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
    const messageId = msg.properties.messageId as string;

    this.logger.log(`Processing webhook: ${embed.title}`);

    // Ждём чтобы не превысить rate limit
    await this.waitForRateLimit();

    const result = await this.discordService.sendWebhook(embed);

    switch (result.status) {
      case DiscordSendStatus.SUCCESS:
        channel.ack(msg);
        this.lastSentAt = Date.now();
        this.logger.log(`Webhook sent: ${embed.title}`);
        await this.discordHookModel.update({ success: true, lastTryAt: new Date() }, { where: { messageId } });
        break;

      case DiscordSendStatus.RATE_LIMITED:
        // 429 — возвращаем в очередь и ждём
        channel.nack(msg, false, true); // requeue = true
        const waitMs = (result.retryAfter ?? 1) * 1000;
        this.logger.warn(`Rate limited, waiting ${waitMs}ms`);
        await this.discordHookModel.increment('failedTries', { where: { messageId } });
        await this.discordHookModel.update(
          { lastTryAt: new Date(), nextRetryAt: new Date(Date.now() + waitMs) },
          { where: { messageId } },
        );
        await this.sleep(waitMs);
        break;

      case DiscordSendStatus.INVALID_WEBHOOK:
        // 400 — отправляем в DLQ
        channel.nack(msg, false, false); // requeue = false → идёт в DLX
        this.logger.error(`Invalid webhook sent to DLQ: ${embed.title}`);
        await this.discordHookModel.increment('failedTries', { where: { messageId } });
        await this.discordHookModel.update({ success: false, lastTryAt: new Date() }, { where: { messageId } });
        break;

      case DiscordSendStatus.ERROR:
        // Неожиданная ошибка — возвращаем в очередь или в DLQ после maxRetryCount попыток
        const hook = await this.discordHookModel.findOne({ where: { messageId } });
        const failedTries = hook?.failedTries ?? 0;
        if (failedTries >= appConfig.discord.maxRetryCount) {
          channel.nack(msg, false, false);
          await this.discordHookModel.update(
            { failedTries: failedTries + 1, success: false, lastTryAt: new Date() },
            { where: { messageId } },
          );
        } else {
          channel.nack(msg, false, true); // requeue = true
          const retryMs = Math.min(1000 * Math.pow(2, failedTries), 30_000);
          await this.discordHookModel.update(
            { failedTries: failedTries + 1, lastTryAt: new Date(), nextRetryAt: new Date(Date.now() + retryMs) },
            { where: { messageId } },
          );
          await this.sleep(retryMs);
        }
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
