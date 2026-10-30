export type KpiCode =
  | 'CTR'
  | 'TIL'
  | 'TCL'
  | 'LPO'
  | 'TPR'
  | 'TSU'
  | 'TCP'
  | 'TAP'
  | 'TPC';

export interface KpiThreshold {
  code: KpiCode;
  name: string;
  phase: 1 | 2;
  unit: 'percent' | 'seconds' | 'days';
  formula: string;
  red: number;
  green: number;
  higherIsBetter: boolean;
  thresholds: string;
}

export const KPI_THRESHOLDS: Record<KpiCode, KpiThreshold> = {
  CTR: {
    code: 'CTR',
    name: 'Tasa de Clics',
    phase: 1,
    unit: 'percent',
    formula: '(clics / impresiones) x 100',
    red: 1,
    green: 3,
    higherIsBetter: true,
    thresholds: 'Rojo < 1% · Amarillo 1%-3% · Verde > 3%',
  },
  TIL: {
    code: 'TIL',
    name: 'Interacción de landing',
    phase: 1,
    unit: 'percent',
    formula: '(visitas con interacción / visitas totales) x 100',
    red: 40,
    green: 60,
    higherIsBetter: true,
    thresholds: 'Rojo < 40% · Amarillo 40%-60% · Verde > 60%',
  },
  TCL: {
    code: 'TCL',
    name: 'Conversión a Leads',
    phase: 1,
    unit: 'percent',
    formula: '(formularios completos / visitas a formulario) x 100',
    red: 10,
    green: 20,
    higherIsBetter: true,
    thresholds: 'Rojo < 10% · Amarillo 10%-20% · Verde > 20%',
  },
  LPO: {
    code: 'LPO',
    name: 'Leads Perfil Objetivo',
    phase: 1,
    unit: 'percent',
    formula: '(leads perfil objetivo / total leads) x 100',
    red: 50,
    green: 70,
    higherIsBetter: true,
    thresholds: 'Rojo < 50% · Amarillo 50%-70% · Verde > 70%',
  },
  TPR: {
    code: 'TPR',
    name: 'Tiempo Promedio de Respuesta IA',
    phase: 1,
    unit: 'seconds',
    formula: 'promedio de tiempo_respuesta_ms / 1000',
    red: 5,
    green: 3,
    higherIsBetter: false,
    thresholds: 'Rojo > 5 s · Amarillo 3-5 s · Verde < 3 s',
  },
  TSU: {
    code: 'TSU',
    name: 'Satisfacción del Usuario',
    phase: 1,
    unit: 'percent',
    formula: '(calificaciones positivas / calificaciones totales) x 100',
    red: 70,
    green: 85,
    higherIsBetter: true,
    thresholds: 'Rojo < 70% · Amarillo 70%-85% · Verde > 85%',
  },
  TCP: {
    code: 'TCP',
    name: 'Conversión a Payers',
    phase: 2,
    unit: 'percent',
    formula: '(payers / leads) x 100',
    red: 10,
    green: 20,
    higherIsBetter: true,
    thresholds: 'Rojo < 10% · Amarillo 10%-20% · Verde > 20%',
  },
  TAP: {
    code: 'TAP',
    name: 'Aceptación de Propuestas',
    phase: 2,
    unit: 'percent',
    formula: '(propuestas aceptadas / propuestas enviadas) x 100',
    red: 20,
    green: 40,
    higherIsBetter: true,
    thresholds: 'Rojo < 20% · Amarillo 20%-40% · Verde > 40%',
  },
  TPC: {
    code: 'TPC',
    name: 'Tiempo Promedio de Conversión',
    phase: 2,
    unit: 'days',
    formula: 'promedio de días desde envío de propuesta hasta pago',
    red: 7,
    green: 4,
    higherIsBetter: false,
    thresholds: 'Rojo > 7 días · Amarillo 4-7 días · Verde < 4 días',
  },
};
