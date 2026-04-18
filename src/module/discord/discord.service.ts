import { Injectable, Logger } from '@nestjs/common';
import got, { HTTPError } from 'got';
import { appConfig } from '../../config';

export interface IDiscordEmbed {
  title: string;
  description: string;
  color?: number;
  footer?: {
    text: string;
  };
}

export enum DiscordSendStatus {
  SUCCESS = 'SUCCESS',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_WEBHOOK = 'INVALID_WEBHOOK',
  ERROR = 'ERROR',
}

export interface DiscordSendResult {
  status: DiscordSendStatus;
  retryAfter?: number; // секунды до повтора при 429
}

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  private readonly WEBHOOK_PAYLOAD = {
    content: '',
    tts: false,
    components: [],
  };

  async sendWebhook(embed: IDiscordEmbed): Promise<DiscordSendResult> {
    try {
      await got.post(appConfig.discord.webhookUrl, {
        json: {
          ...this.WEBHOOK_PAYLOAD,
          embeds: [embed],
        },
      });

      this.logger.log(`Webhook sent successfully: ${embed.title}`);

      return { status: DiscordSendStatus.SUCCESS };
    } catch (error) {
      if (error instanceof HTTPError) {
        const statusCode = error.response.statusCode;

        // 429 — rate limit
        if (statusCode === 429) {
          const body = error.response.body as { retry_after?: number };
          const retryAfter = body?.retry_after ?? 1;

          this.logger.warn(`Rate limited! Retry after ${retryAfter}s. Webhook: ${embed.title}`);

          return {
            status: DiscordSendStatus.RATE_LIMITED,
            retryAfter,
          };
        }

        // 400 — невалидный вебхук → DLQ
        if (statusCode === 400) {
          this.logger.error(`Invalid webhook payload: ${embed.title}`, error.response.body);

          return { status: DiscordSendStatus.INVALID_WEBHOOK };
        }
      }

      this.logger.error(`Unexpected error sending webhook: ${embed.title}`, error);

      return { status: DiscordSendStatus.ERROR };
    }
  }
}
