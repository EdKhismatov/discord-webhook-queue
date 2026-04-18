// src/modules/webhook/webhook.module.ts
import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module';
import { WebhookController } from './webhook.controller';
import { WebhookProcessor } from './webhook.processor';
import { WebhookService } from './webhook.service';

@Module({
  imports: [DiscordModule],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookProcessor],
})
export class WebhookModule {}
