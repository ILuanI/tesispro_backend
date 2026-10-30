import { describe, expect, it } from 'vitest';
import { makeKpi, makeRatioKpi, ratioPercentage, trafficLight } from './impulse-kpi.js';
import { KPI_THRESHOLDS } from './impulse-kpi.config.js';

describe('IMPULSE KPI calculations', () => {
  it('returns null instead of NaN when a denominator is zero', () => {
    expect(ratioPercentage(5, 0)).toBeNull();
    expect(makeRatioKpi('CTR', 5, 0)).toMatchObject({
      value: null,
      status: 'empty',
    });
  });

  it('uses yellow for exact lower boundary on higher-is-better KPIs', () => {
    expect(trafficLight(10, KPI_THRESHOLDS.TCL)).toBe('yellow');
  });

  it('uses yellow for exact upper boundary on higher-is-better KPIs', () => {
    expect(trafficLight(20, KPI_THRESHOLDS.TCL)).toBe('yellow');
  });

  it('uses green only above the green threshold on higher-is-better KPIs', () => {
    expect(trafficLight(20.01, KPI_THRESHOLDS.TCL)).toBe('green');
  });

  it('supports inverted thresholds for response time', () => {
    expect(trafficLight(5.01, KPI_THRESHOLDS.TPR)).toBe('red');
    expect(trafficLight(5, KPI_THRESHOLDS.TPR)).toBe('yellow');
    expect(trafficLight(3, KPI_THRESHOLDS.TPR)).toBe('yellow');
    expect(trafficLight(2.99, KPI_THRESHOLDS.TPR)).toBe('green');
  });

  it('supports inverted thresholds for conversion time', () => {
    expect(makeKpi('TPC', 8)).toMatchObject({ status: 'red' });
    expect(makeKpi('TPC', 4)).toMatchObject({ status: 'yellow' });
    expect(makeKpi('TPC', 3.5)).toMatchObject({ status: 'green' });
  });
});
