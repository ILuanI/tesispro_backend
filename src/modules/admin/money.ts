import { BadRequestException } from '@nestjs/common';

export function cents(value: string): bigint {
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value))
    throw new BadRequestException('Importe inválido: usa hasta dos decimales.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function decimal(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}
export function monthlySchedule(total: string, count: number, first: string) {
  const amount = cents(total);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 120 ||
    amount < BigInt(count)
  )
    throw new BadRequestException(
      'Usa entre 1 y 120 cuotas con un importe mínimo de 0.01.',
    );
  const [y, m, d] = first.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.toISOString().slice(0, 10) !== first)
    throw new BadRequestException('Fecha inválida.');
  const each = amount / BigInt(count);
  return Array.from({ length: count }, (_, i) => {
    const last = new Date(Date.UTC(y, m + i, 0)).getUTCDate();
    return {
      nroCuota: i + 1,
      monto: decimal(
        i === count - 1 ? amount - each * BigInt(count - 1) : each,
      ),
      fechaVencimiento: new Date(Date.UTC(y, m - 1 + i, Math.min(d, last)))
        .toISOString()
        .slice(0, 10),
    };
  });
}
