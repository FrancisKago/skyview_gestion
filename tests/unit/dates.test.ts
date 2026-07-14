import { describe, it, expect } from 'vitest';
import { toDateStr } from '@/lib/dates';

describe('toDateStr', () => {
  it('formate une date locale en YYYY-MM-DD avec zéros de tête', () => {
    expect(toDateStr(new Date(2026, 6, 14))).toBe('2026-07-14');
    expect(toDateStr(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toDateStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
  it('utilise le fuseau local, pas UTC (23h59 reste le même jour)', () => {
    expect(toDateStr(new Date(2026, 6, 14, 23, 59, 59))).toBe('2026-07-14');
  });
});
