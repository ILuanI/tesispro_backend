import { KPI_THRESHOLDS, type KpiCode, type KpiThreshold } from './impulse-kpi.config.js';

export type TrafficLight = 'red' | 'yellow' | 'green' | 'empty';

export interface CalculatedKpi {
  code: KpiCode;
  name: string;
  phase: 1 | 2;
  unit: KpiThreshold['unit'];
  formula: string;
  thresholds: string;
  numerator: number | null;
  denominator: number | null;
  value: number | null;
  status: TrafficLight;
}

export function ratioPercentage(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0)
    return null;
  return round((numerator / denominator) * 100);
}

export function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function trafficLight(
  value: number | null,
  threshold: Pick<KpiThreshold, 'red' | 'green' | 'higherIsBetter'>,
): TrafficLight {
  if (value === null || !Number.isFinite(value)) return 'empty';

  if (threshold.higherIsBetter) {
    if (value < threshold.red) return 'red';
    if (value > threshold.green) return 'green';
    return 'yellow';
  }

  if (value > threshold.red) return 'red';
  if (value < threshold.green) return 'green';
  return 'yellow';
}

export function makeKpi(
  code: KpiCode,
  value: number | null,
  numerator: number | null = null,
  denominator: number | null = null,
): CalculatedKpi {
  const threshold = KPI_THRESHOLDS[code];
  return {
    code,
    name: threshold.name,
    phase: threshold.phase,
    unit: threshold.unit,
    formula: threshold.formula,
    thresholds: threshold.thresholds,
    numerator,
    denominator,
    value: value === null ? null : round(value),
    status: trafficLight(value, threshold),
  };
}

export function makeRatioKpi(code: KpiCode, numerator: number, denominator: number) {
  return makeKpi(code, ratioPercentage(numerator, denominator), numerator, denominator);
}

export const positiveSatisfactionDefinition =
  'Se considera positiva la calificación booleana mensaje.calificacion_positiva = true.';
