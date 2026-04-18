import { Module } from '@nestjs/common';
import { DatabaseModule } from './module/database/database.module';
import { DiscordModule } from './module/discord/discord.module';
import { RabbitModule } from './module/rabbit/rabbit.module';
import { WebhookModule } from './module/webhook/webhook.module';

@Module({
  imports: [DatabaseModule, RabbitModule, DiscordModule, WebhookModule],
})
export class AppModule {}
