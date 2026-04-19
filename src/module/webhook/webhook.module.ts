import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DiscordHook } from '../database/entities/discord-hook.model';
import { DiscordModule } from '../discord/discord.module';
import { WebhookController } from './webhook.controller';
import { WebhookProcessor } from './webhook.processor';
import { WebhookService } from './webhook.service';

@Module({
  imports: [DiscordModule, SequelizeModule.forFeature([DiscordHook])],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookProcessor],
})
export class WebhookModule {}
