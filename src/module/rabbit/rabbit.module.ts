// src/modules/rabbit/rabbit.module.ts
import { Global, Module } from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import { appConfig } from '../../config';

export const RABBIT_CONNECTION = 'RABBIT_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: RABBIT_CONNECTION,
      useFactory: () => {
        return amqp.connect([appConfig.rabbit.rabbitUrl]);
      },
    },
  ],
  exports: [RABBIT_CONNECTION],
})
export class RabbitModule {}
