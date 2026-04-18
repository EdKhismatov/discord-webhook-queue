import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsString } from 'class-validator';

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

  @IsString()
  rabbitUrl: string;

  @IsString()
  discord: string;
}
