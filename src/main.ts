import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

async function bootstrap() {
  console.info('[bootstrap] Cargando modulos de NestJS.');
  const { AppModule } = await import('./app.module.js');
  console.info('[bootstrap] Inicializando NestJS y PostgreSQL.');
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  await app.init();
  console.info('[bootstrap] Modulos inicializados; iniciando servidor HTTP.');
  app.getHttpServer().once('listening', () => {
    console.info('[bootstrap] Servidor HTTP listo.');
  });
  const listening = app.listen(process.env.PORT ?? 3000);
  if (process.env.VERCEL === '1') {
    // Vercel intercepta listen() y abre el puerto despues de importar este modulo.
    // Esperar esa promesa aqui bloquearia la importacion y el arranque del servidor.
    void listening.catch((error: unknown) => {
      console.error('[bootstrap] No se pudo abrir el servidor HTTP:', error);
      throw error;
    });
  } else {
    await listening;
  }
}
await bootstrap().catch((error: unknown) => {
  console.error('[bootstrap] No se pudo iniciar el backend:', error);
  throw error;
});
