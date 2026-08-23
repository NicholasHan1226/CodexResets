/** Whether an hour falls inside a three-hour window, including midnight wrap. */
export function isPeakHour(hour: number, peakStart: number): boolean {
  return (hour - peakStart + 24) % 24 < 3;
}
