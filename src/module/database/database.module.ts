import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { appConfig } from '../../config';
import { DiscordHook } from './entities/discord-hook.model';

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'postgres',
      host: appConfig.db.host,
      port: appConfig.db.port,
      username: appConfig.db.user,
      password: appConfig.db.password,
      database: appConfig.db.name,
      models: [DiscordHook],
      autoLoadModels: true,
      synchronize: true,
    }),
  ],
})
export class DatabaseModule {}
