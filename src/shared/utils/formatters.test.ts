import { describe, it, expect } from 'vitest';
import { hoyISO } from './formatters';

describe('hoyISO', () => {
  it('usa la fecha local, no la UTC (a las 11:30 p. m. sigue siendo el mismo día)', () => {
    expect(hoyISO(new Date(2026, 9, 1, 23, 30))).toBe('2026-10-01');
    expect(hoyISO(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
});
