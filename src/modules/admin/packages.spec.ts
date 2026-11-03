import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PackageDto } from './packages.dto.js';
import { packageActivationError } from './packages.service.js';
describe('R11 validación comercial', () => {
  const draft = {
    codigo: 'TEST_R11',
    nombre: 'Solo prueba',
    componentes: [],
    entregables: [],
    restricciones: [],
    precioFijo: null,
    moneda: 'PEN',
    modalidad: 'virtual',
    estado: 'borrador',
  };
  it('permite borrador sin precio ni condiciones ficticias', async () => {
    expect(await validate(plainToInstance(PackageDto, draft))).toHaveLength(0);
  });
  it.each(['-1.00', '1.001', '1e3', 'NaN', '100000000.00'])(
    'rechaza importe %s',
    async (precioFijo) => {
      expect(
        await validate(plainToInstance(PackageDto, { ...draft, precioFijo })),
      ).not.toHaveLength(0);
    },
  );
  it('publicación requiere contenido mínimo y permite precio cero', () => {
    expect(
      packageActivationError({ ...draft, descripcion: null }),
    ).toBeTruthy();
    expect(
      packageActivationError({
        ...draft,
        descripcion: 'Prueba',
        precioFijo: '0.00',
        componentes: [
          { idServicio: 1, cantidad: 1, nombre: 'Prueba', codigo: 'TEST' },
        ],
        entregables: ['Resultado autorizado'],
        restricciones: ['Condición autorizada'],
      }),
    ).toBeNull();
  });
});
