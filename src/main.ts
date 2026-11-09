import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

async function bootstrap() {
  console.info('[bootstrap] Cargando modulos de NestJS.');
  const { AppModule } = await import('./app.module.js');
  console.info('[bootstrap] Inicializando NestJS y PostgreSQL.');
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  console.info('[bootstrap] Modulos inicializados; iniciando servidor HTTP.');
  await app.listen(process.env.PORT ?? 3000);
  console.info('[bootstrap] Servidor HTTP listo.');
}
await bootstrap().catch((error: unknown) => {
  console.error('[bootstrap] No se pudo iniciar el backend:', error);
  throw error;
});
