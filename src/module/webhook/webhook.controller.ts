import { Body, Controller, HttpCode, HttpStatus, Logger, Post, ServiceUnavailableException } from '@nestjs/common';
import { SendWebhookDto } from './dto';
import { WebhookService } from './webhook.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  constructor(private readonly webhookService: WebhookService) {}

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  async send(@Body() dto: SendWebhookDto) {
    try {
      await this.webhookService.publish(dto);
      return true;
    } catch (err) {
      this.logger.error('Failed to publish webhook', err);
      throw new ServiceUnavailableException('Queue unavailable');
    }
  }
}
