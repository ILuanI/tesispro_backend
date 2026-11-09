# Backend en Vercel

El proyecto usa el soporte nativo de NestJS y la entrada `src/main.ts`.
`vercel.json` fija el framework. El archivo `config/tesi-qualification.json`
se lee mediante una URL estatica relativa al modulo para que el empaquetador lo detecte.
No se configura `functions.src/main.ts`: el soporte nativo genera la funcion de NestJS.
Las rutas del backend no llevan el prefijo `/api`.

## Configuracion del proyecto

- Root Directory: `./` si este repositorio contiene solo el backend; `tesispro_backend` si contiene ambas aplicaciones.
- Framework Preset: NestJS (definido tambien en `vercel.json`).
- Node.js: 24.x. Mantener Build Command y Output Directory del preset, sin overrides.
- Importar las variables en Production y volver a desplegar despues de cambiarlas.

## Variables de produccion

| Variable | Valor |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | Credenciales del PostgreSQL de produccion |
| `DB_SSL` | `true` (sin comillas en el formulario de Vercel) |
| `DB_SSL_CA` | Contenido completo de `ca.pem` si el proveedor usa una CA propia |
| `DB_POOL_MAX` | `2` conexiones por instancia; ajustar segun el limite del proveedor |
| `DB_CONNECT_TIMEOUT_MS` | `10000` |
| `DB_LOGGING` | `false` |
| `DB_RUN_MIGRATIONS` | `false` |
| `NODE_ENV` | `production` |
| `APP_ORIGIN` | `https://tesispro-eta.vercel.app`, si este es el dominio definitivo del frontend; sin barra final |
| `CRM_BRIDGE_SECRET` | Secreto de al menos 32 caracteres, identico al del servidor Astro |
| `R8_AI_URL` | `https://tesispro-eta.vercel.app/api/internal/proposal` |
| `REFERRAL_TTL_DAYS` | `30`, opcional |

Vercel define `VERCEL=1` automaticamente. En ese entorno SSL se activa por defecto,
se validan las variables de conexion, se limita el pool y se realizan dos intentos
de conexion. Se verifica siempre el certificado; no se desactiva su validacion.
`PORT` y `R7_RULES_FILE` no necesitan configurarse para el despliegue habitual.
Los `.env` locales y `ca.pem` no se suben como parte del despliegue: usar las variables de Vercel.

## Migraciones

La funcion no ejecuta migraciones al arrancar en Vercel. Ejecutarlas desde una
terminal con las variables de la base correcta:

```sh
pnpm migration:run
pnpm migration:show
```

Las migraciones de la base actual ya fueron ejecutadas; no hay que reinicializarla.

## Conexion con Astro y comprobacion

En el proyecto del frontend:

```env
API_PROXY_TARGET=https://tesispro-net-backend.vercel.app
CRM_API_URL=https://tesispro-net-backend.vercel.app
```

Astro atiende `/api/auth/login` y lo reenvia a `/auth/login` del backend.
El frontend necesita su adaptador de Vercel para publicar las rutas de servidor.

Despues de desplegar, abrir `https://tesispro-net-backend.vercel.app/`:
debe devolver `200` y `Hello World!`. Como NestJS inicializa PostgreSQL antes
de escuchar, esta respuesta confirma que la conexion inicial se completo.
`GET /auth/me` sin sesion debe devolver `401`.
Si el arranque falla, revisar Runtime Logs del despliegue que recibe la peticion.
