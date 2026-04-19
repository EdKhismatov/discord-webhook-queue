import { Type } from 'class-transformer';
import { IsEnum, IsNumber, ValidateNested } from 'class-validator';
import { DbConfigDto } from './db-config.dto';
import { DiscordConfigDto } from './discord-config.dto';
import { RabbitConfigDto } from './rabbit.dto';

export enum Environment {
  PROD = 'prod',
  DEV = 'dev',
}

export class AppConfigDto {
  @IsEnum(Environment)
  env: Environment;

  @IsNumber()
  @Type(() => Number)
  readonly port: number;

  @ValidateNested()
  @Type(() => DiscordConfigDto)
  discord: DiscordConfigDto;

  @ValidateNested()
  @Type(() => RabbitConfigDto)
  rabbit: RabbitConfigDto;

  @ValidateNested()
  @Type(() => DbConfigDto)
  db: DbConfigDto;
}
