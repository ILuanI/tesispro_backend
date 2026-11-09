import assert from 'node:assert/strict';
import http from 'node:http';

// Reproduce la captura de listen() del cargador de @vercel/node.
// Requiere las variables de una base accesible; no ejecuta migraciones ni escribe datos.
process.env.VERCEL = '1';
process.env.DB_RUN_MIGRATIONS = 'false';
let capturedServer;
const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function () {
  capturedServer = this;
  http.Server.prototype.listen = originalListen;
  return this;
};

const timeout = setTimeout(() => {
  console.error('El modulo no termino de cargar: posible espera circular en listen().');
  process.exit(1);
}, 30000);

try {
  await import('../dist/main.js');
  assert.ok(capturedServer, 'El cargador debe capturar el servidor de NestJS.');
  // Vercel abre el puerto una vez que la importacion ha terminado.
  await new Promise((resolve, reject) => {
    capturedServer.once('error', reject);
    originalListen.call(capturedServer, 0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${capturedServer.address().port}`;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'Hello World!');
  const unauthorized = await fetch(`${base}/auth/me`);
  assert.equal(unauthorized.status, 401);
  console.log('Carga compatible con Vercel: GET / = 200, GET /auth/me = 401.');
  clearTimeout(timeout);
  capturedServer.close();
  process.exit(0);
} catch (error) {
  console.error(error);
  clearTimeout(timeout);
  process.exit(1);
} finally {
  http.Server.prototype.listen = originalListen;
}
