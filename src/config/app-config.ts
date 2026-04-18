import { config as readEnv } from 'dotenv';
import * as process from 'node:process';
import { validate } from '../validation/validate.dto';
import { AppConfigDto } from './dto';

readEnv();

type EnvStructure<T = any> = {
  [key in keyof T]: T[key] extends object ? EnvStructure<T[key]> : string | undefined;
};

const rawConfig: EnvStructure<AppConfigDto> = {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  rabbitUrl: process.env.RABBITMQ_URL,
  discord: process.env.DISCORD_WEBHOOK_URL,
};

export const appConfig = validate(AppConfigDto, rawConfig);
