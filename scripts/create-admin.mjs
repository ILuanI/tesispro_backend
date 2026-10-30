import 'reflect-metadata';
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { passwordHash } from '../dist/modules/admin/auth.js';
import db from '../dist/database/typeorm.config.js';

async function hiddenPassword() {
  if (!stdin.isTTY)
    throw new Error('Ejecuta este comando desde una terminal interactiva.');
  stdout.write('Contraseña (mínimo 12 caracteres): ');
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const handler = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Cancelado.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= ' ') value += char;
      }
    };
    const cleanup = () => {
      stdin.off('data', handler);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    stdin.on('data', handler);
  });
}
try {
  const rl = createInterface({ input: stdin, output: stdout });
  const correo = (await rl.question('Correo del administrador: '))
    .trim()
    .toLowerCase();
  const nombres = (await rl.question('Nombres: ')).trim();
  const apellidos = (await rl.question('Apellidos: ')).trim();
  rl.close();
  const password = await hiddenPassword();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
    !nombres ||
    !apellidos ||
    password.length < 12 ||
    password.length > 200
  )
    throw new Error(
      'Datos inválidos. La contraseña debe tener entre 12 y 200 caracteres.',
    );
  await db.initialize();
  const hash = await passwordHash(password);
  await db.transaction(async (m) => {
    const [existing] = await m.query(
      'SELECT id_usuario,rol,password_hash FROM usuario_interno WHERE lower(correo)=$1 FOR UPDATE',
      [correo],
    );
    if (existing) {
      if (existing.rol !== 'administrador' || existing.password_hash)
        throw new Error(
          'Este correo ya tiene acceso o corresponde a otro rol. No se modificó.',
        );
      await m.query(
        'UPDATE usuario_interno SET password_hash=$1 WHERE id_usuario=$2',
        [hash, existing.id_usuario],
      );
    } else
      await m.query(
        "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES($1,$2,$3,'administrador',$4)",
        [nombres, apellidos, correo, hash],
      );
  });
  console.log(
    'Administrador configurado. Ya puedes iniciar sesión en /admin/login.',
  );
} catch (error) {
  console.error(error.message || 'No se pudo configurar el administrador.');
  process.exitCode = 1;
} finally {
  if (db.isInitialized) await db.destroy();
}
