import { Module } from '@nestjs/common';
import { DiscordModule } from './module/discord/discord.module';
import { RabbitModule } from './module/rabbit/rabbit.module';
import { WebhookModule } from './module/webhook/webhook.module';

@Module({
  imports: [RabbitModule, DiscordModule, WebhookModule],
})
export class AppModule {}
