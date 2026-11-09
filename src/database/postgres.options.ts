import pg from 'pg';

type ReadEnvironment = (key: string) => string | undefined;

export function postgresOptions(read: ReadEnvironment = (key) => process.env[key]) {
  const vercel = read('VERCEL') === '1';
  const sslEnabled = (read('DB_SSL') ?? String(vercel)).trim().toLowerCase() === 'true';
  const ca = read('DB_SSL_CA')?.replace(/\\n/g, '\n').trim();

  const integer = (key: string, fallback: number) => {
    const value = Number(read(key) ?? fallback);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${key} debe ser un entero positivo.`);
    return value;
  };

  if (vercel) {
    for (const key of ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE']) {
      if (!read(key)?.trim()) throw new Error(`Falta configurar ${key} en Vercel.`);
    }
    if (!sslEnabled) throw new Error('Configura DB_SSL=true para PostgreSQL en Vercel.');
  }

  return {
    type: 'postgres' as const,
    // La importacion explicita evita depender de la carga dinamica de TypeORM.
    driver: pg,
    host: read('DB_HOST') ?? 'localhost',
    port: integer('DB_PORT', 5432),
    username: read('DB_USERNAME') ?? 'postgres',
    password: read('DB_PASSWORD') ?? 'postgres',
    database: read('DB_DATABASE') ?? 'tesispro',
    ssl: sslEnabled ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false,
    connectTimeoutMS: integer('DB_CONNECT_TIMEOUT_MS', 10000),
    extra: {
      max: integer('DB_POOL_MAX', vercel ? 2 : 10),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: integer('DB_CONNECT_TIMEOUT_MS', 10000),
    },
  };
}
