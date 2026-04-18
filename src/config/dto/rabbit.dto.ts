import { IsString } from 'class-validator';

export class RabbitConfigDto {
  @IsString()
  rabbitUrl: string;

  @IsString()
  rabbitPassword: string;

  @IsString()
  rabbitUser: string;
}
