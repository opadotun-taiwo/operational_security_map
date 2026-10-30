import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatDuration, formatDistance, calculateRoute } from '../services/routingService';

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

describe('calculateRoute', () => {
  const origin = { lat: 9.07, lng: 7.48 };
  const destination = { lat: 10.52, lng: 7.44 };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the Maps JavaScript API Routes library when available', async () => {
    const computeRoutes = vi.fn().mockResolvedValue({
      routes: [
        {
          description: 'A2',
          distanceMeters: 196430,
          durationMillis: 11536000,
          path: [{ lat: 9.07, lng: 7.48 }, { lat: 9.8, lng: 7.46 }, { lat: 10.52, lng: 7.44 }]
        },
        {
          description: 'A235',
          distanceMeters: 210000,
          durationMillis: 12600000,
          path: [{ lat: () => 9.07, lng: () => 7.48 }, { lat: () => 10.52, lng: () => 7.44 }]
        }
      ]
    });
    vi.stubGlobal('window', {
      google: { maps: { importLibrary: vi.fn().mockResolvedValue({ Route: { computeRoutes } }) } }
    });

    const result = await calculateRoute({ origin, destination });

    expect(result.source).toBe('Google Routes API');
    expect(result.isEstimate).toBeUndefined();
    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].summary).toBe('via A2');
    expect(result.routes[0].distanceText).toBe('196 km');
    expect(result.routes[0].durationText).toBe('3h 12m');
    expect(result.routes[0].coordinates[0]).toEqual([7.48, 9.07]);
    expect(result.routes[1].coordinates[1]).toEqual([7.44, 10.52]);
    expect(computeRoutes).toHaveBeenCalledWith(expect.objectContaining({
      origin,
      destination,
      travelMode: 'DRIVING',
      computeAlternativeRoutes: true
    }));
  });

  it('falls back to a flagged straight-line estimate when every provider fails', async () => {
    vi.stubGlobal('window', {
      google: { maps: { importLibrary: vi.fn().mockRejectedValue(new Error('REQUEST_DENIED')) } }
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await calculateRoute({ origin, destination });

    expect(result.isEstimate).toBe(true);
    expect(result.source).toBe('Straight-line Estimate');
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].coordinates.length).toBeGreaterThan(2);
  });
});
