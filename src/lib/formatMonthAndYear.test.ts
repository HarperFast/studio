import { describe, it, expect } from 'vitest';
import { formatMonthAndYear } from './formatMonthAndYear';

describe('formatMonthAndYear', () => {
  it('formats single-digit month with leading zero and two-digit year from full year', () => {
    expect(formatMonthAndYear(3, 2025)).toBe('03/25');
  });

  it('formats double-digit month correctly and two-digit year from full year', () => {
    expect(formatMonthAndYear(11, 1999)).toBe('11/99');
  });

  it('handles two-digit year inputs as well', () => {
    expect(formatMonthAndYear(12, 9)).toBe('12/09');
    expect(formatMonthAndYear(1, 0)).toBe('01/00');
  });

  it('does not include any trailing parenthesis', () => {
    const value = formatMonthAndYear(6, 2024);
    expect(value.endsWith(')')).toBe(false);
    expect(value).toBe('06/24');
  });
});
