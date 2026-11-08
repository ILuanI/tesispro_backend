import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { TesiQualificationService } from './tesi-qualification.service.js';
import { CaptureProfileService } from './capture-profile.service.js';

describe('Conversación de Tesi con paquetes publicados', () => {
  const incoming = () => ({ campos: Object.fromEntries([
    ['necesidad', 'orientación inicial para comenzar la tesis'], ['etapa', 'inicio'], ['servicio', 'paquete-4'],
  ].map(([key, valor]) => [key, { valor, tipo: 'inferido', evidencias: [{ idMensaje: '1', fragmento: 'empezar mi tesis' }] }])), senales: {} });
  const manager = { query: async (sql: string) => sql.includes('SELECT contenido FROM mensaje') ? [{ contenido: 'Quiero empezar mi tesis' }] : [] };

  it('reconoce inicio y el paquete Básico aunque no tenga componentes históricos', async () => {
    const service = new TesiQualificationService({ forProposal: async () => ({ paquete: { codigo: 'basico', componentes: [] } }) } as any);
    const result = await service.evaluate(manager as any, '1', 'turn', null, null, incoming(), 2);
    expect(result.suficiente).toBe(true);
    expect(result.servicio).toBe('paquete-4');
  });

  it('mantiene el rechazo de paquetes sin correspondencia y de citas inventadas', async () => {
    const service = new TesiQualificationService({ forProposal: async () => ({ paquete: { codigo: 'desconocido', componentes: [] } }) } as any);
    expect((await service.evaluate(manager as any, '1', 'turn', null, null, incoming(), 2)).servicio).toBeNull();
    const invalid = incoming();
    invalid.campos.necesidad.evidencias[0].fragmento = 'Nunca lo dije';
    await expect(service.evaluate(manager as any, '1', 'turn', null, null, invalid, 2)).rejects.toThrow('La evidencia no corresponde');
  });

  it('guardar la calificación no reemplaza la respuesta conversacional ni agrega botones de confirmación', async () => {
    const reply = 'Para comenzar, delimita un tema y un problema. ¿Qué área de tu carrera te interesa?';
    const result = { state: { catalogMode: true, humanRequested: false, service: null }, reply, quickReplies: ['Aún no tengo tema'], interpretacionR7: incoming() };
    const m = { query: async (sql: string) => {
      if (sql.includes('SELECT * FROM acceso_contacto')) return [{ id_sesion: '1' }];
      if (sql.includes('SELECT t.*,c.id_sesion')) return [{ id_sesion: '1', id_conversacion: '1', id_mensaje: '1', contenido: 'Quiero empezar mi tesis' }];
      return [];
    } };
    const capture = new CaptureProfileService({ transaction: async (fn: any) => fn(m) } as any, {} as any, {} as any, {
      evaluate: async () => ({ suficiente: false, servicio: null, campos: { necesidad: { valor: 'orientación inicial', tipo: 'inferido' } } }),
    } as any);
    const saved = await capture.finish('test-token', { idTurno: 'test-turn', mensaje: 'Quiero empezar mi tesis', respuesta: reply, resultadoJson: JSON.stringify(result) });
    expect(saved.resultado.reply).toBe(reply);
    expect(saved.resultado.quickReplies).toEqual(['Aún no tengo tema']);
    expect(saved.resultado.proposal).toBeNull();
  });
});
