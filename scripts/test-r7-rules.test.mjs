import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TesiQualificationService } from '../dist/modules/admin/tesi-qualification.service.js';

test('las reglas cambian de versión y una configuración inválida no clasifica', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tesispro-r7-'));
  const previous = process.env.R7_RULES_FILE;
  const originalError = console.error;
  try {
    const path = join(directory, 'rules.json');
    const config = JSON.parse(await readFile('config/tesi-qualification.json', 'utf8'));
    await writeFile(path, JSON.stringify(config));
    process.env.R7_RULES_FILE = path;
    const first = new TesiQualificationService({});
    assert.match(first.version, /^[a-f0-9]{64}$/);
    config.niveles.medio = [];
    await writeFile(path, JSON.stringify(config));
    const changed = new TesiQualificationService({});
    assert.notEqual(first.version, changed.version);
    config.prioridad = ['bajo', 'medio', 'alto', 'intencion_contratacion'];
    await writeFile(path, JSON.stringify(config));
    console.error = () => {};
    const invalid = new TesiQualificationService({});
    await assert.rejects(() => invalid.evaluate({}, '1', 'turn', null, null, { campos: {}, senales: {} }), { status: 503 });
  } finally {
    console.error = originalError;
    if (previous === undefined) delete process.env.R7_RULES_FILE; else process.env.R7_RULES_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
