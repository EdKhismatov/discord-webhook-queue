import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SendWebhookDto } from './dto/send-webhook.dto';
import { WebhookService } from './webhook.service';

@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  async send(@Body() dto: SendWebhookDto) {
    await this.webhookService.publish(dto);

    return {
      message: 'Webhook accepted and queued',
    };
  }
}
