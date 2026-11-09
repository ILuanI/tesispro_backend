import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { entities } from '../entities/index.js';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        // Import explicito para incluir pg en el paquete serverless de Vercel.
        driver: pg,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_DATABASE', 'impulse'),
        ssl: config.get<string>('DB_SSL', 'false') === 'true'
          ? { rejectUnauthorized: true, ...(config.get<string>('DB_SSL_CA') ? { ca: config.get<string>('DB_SSL_CA')!.replace(/\\n/g, '\n') } : {}) }
          : false,
        entities,
        namingStrategy: new SnakeNamingStrategy(),
        synchronize: false,
        migrationsRun: config.get<string>('DB_RUN_MIGRATIONS', 'false') === 'true',
        migrations: [fileURLToPath(new URL('../migrations/*.js', import.meta.url))],
        logging: config.get<string>('DB_LOGGING', 'false') === 'true',
      }),
    }),
  ],
})
export class DatabaseModule {}
