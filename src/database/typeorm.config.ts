import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { entities } from '../entities/index.js';
import { fileURLToPath } from 'url'; // <-- Importar
import { dirname, join } from 'path'; // <-- Importar
import { postgresOptions } from './postgres.options.js';

loadEnv();

// Recrear __dirname para entornos ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default new DataSource({
  ...postgresOptions(),
  entities,
  namingStrategy: new SnakeNamingStrategy(),
  // Esto buscará los archivos .js compilados en dist/migrations
  migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')], 
  synchronize: false,
});
