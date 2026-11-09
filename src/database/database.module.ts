import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { entities } from '../entities/index.js';
import { fileURLToPath } from 'node:url';
import { postgresOptions } from './postgres.options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...postgresOptions((key) => config.get<string>(key)),
        entities,
        namingStrategy: new SnakeNamingStrategy(),
        synchronize: false,
        migrationsRun: config.get<string>('VERCEL') !== '1' && config.get<string>('DB_RUN_MIGRATIONS', 'false') === 'true',
        migrations: config.get<string>('VERCEL') === '1' ? [] : [fileURLToPath(new URL('../migrations/*.js', import.meta.url))],
        retryAttempts: config.get<string>('VERCEL') === '1' ? 2 : 10,
        retryDelay: 1000,
        logging: config.get<string>('DB_LOGGING', 'false') === 'true',
      }),
    }),
  ],
})
export class DatabaseModule {}
