import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { entities } from '../entities/index.js';
import { fileURLToPath } from 'url'; // <-- Importar
import { dirname, join } from 'path'; // <-- Importar

loadEnv();

// Recrear __dirname para entornos ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'tesispro', // Nota: pusiste 'impulse', pero en tu .env es 'tesispro'
  entities,
  namingStrategy: new SnakeNamingStrategy(),
  // Esto buscará los archivos .js compilados en dist/migrations
  migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')], 
  synchronize: false,
});