import { describe, it, expect } from 'vitest';
import { formatDuration, formatDistance } from '../services/routingService';

describe('routingService utilities', () => {
  it('formats seconds to duration string', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(1800)).toBe('30 min');
    expect(formatDuration('5400s')).toBe('1h 30m');
    expect(formatDuration(null)).toBe('Unknown');
  });

  it('formats distance in meters to kilometers', () => {
    expect(formatDistance(5000)).toBe('5.0 km');
    expect(formatDistance(154200)).toBe('154 km');
    expect(formatDistance(null)).toBe('Unknown');
  });
});

