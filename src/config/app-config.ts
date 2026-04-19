import { config as readEnv } from 'dotenv';
import * as process from 'node:process';
import { validate } from '../validation/validate.dto';
import { AppConfigDto } from './dto';

readEnv();

type EnvStructure<T = object> = {
  [key in keyof T]: T[key] extends object ? EnvStructure<T[key]> : string | undefined;
};

const rawConfig: EnvStructure<AppConfigDto> = {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    rateLimitIntervalFactor: process.env.RATE_LIMIT_INTERVAL_FACTOR,
    maxRetryCount: process.env.DISCORD_MAX_RETRY_COUNT,
  },
  rabbit: {
    rabbitUrl: process.env.RABBITMQ_URL,
    rabbitPassword: process.env.RABBIT_PASSWORD,
    rabbitUser: process.env.RABBITMQ_DEFAULT_USER,
  },
  db: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
  },
};

export const appConfig = validate(AppConfigDto, rawConfig);
