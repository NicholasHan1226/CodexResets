import { describe, expect, it } from 'vitest';
import { isPeakHour } from '@/lib/time-window';

describe('isPeakHour', () => {
  it('highlights every hour in a peak window that crosses midnight', () => {
    expect(isPeakHour(23, 23)).toBe(true);
    expect(isPeakHour(0, 23)).toBe(true);
    expect(isPeakHour(1, 23)).toBe(true);
    expect(isPeakHour(2, 23)).toBe(false);
  });

  it('does not change normal daytime peak windows', () => {
    expect(isPeakHour(9, 8)).toBe(true);
    expect(isPeakHour(10, 8)).toBe(true);
    expect(isPeakHour(11, 8)).toBe(false);
  });
});
