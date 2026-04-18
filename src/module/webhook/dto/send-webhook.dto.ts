// src/modules/webhook/dto/send-webhook.dto.ts
import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

class FooterDto {
  @IsString()
  text: string;
}

export class SendWebhookDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsNumber()
  @IsOptional()
  color?: number;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => FooterDto)
  footer?: FooterDto;
}
