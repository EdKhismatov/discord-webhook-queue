import { Type } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';

export class DiscordConfigDto {
  @IsString()
  webhookUrl: string;

  @IsNumber()
  @Type(() => Number)
  rateLimit: number;

  @IsNumber()
  @Type(() => Number)
  maxRetryCount: number;
}
