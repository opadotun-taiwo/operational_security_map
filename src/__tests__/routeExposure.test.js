import { describe, it, expect } from 'vitest';
import { 
  validateCoordinates, 
  decodePolylineGeometry, 
  calculateRouteExposure 
} from '../utils/routeExposure';

describe('validateCoordinates', () => {
  it('validates correct coordinates within Nigeria', () => {
    const abuja = { lat: 9.0765, lng: 7.3986 };
    const res = validateCoordinates(abuja);
    expect(res.valid).toBe(true);
    expect(res.error).toBeNull();
  });

  it('rejects coordinates outside Nigeria when enforceNigeriaBounds is true', () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const res = validateCoordinates(london, true);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('outside the Nigerian operational theater');
  });

  it('accepts global coordinates when enforceNigeriaBounds is false', () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const res = validateCoordinates(london, false);
    expect(res.valid).toBe(true);
  });

  it('rejects invalid or non-numeric values', () => {
    expect(validateCoordinates(null).valid).toBe(false);
    expect(validateCoordinates({ lat: 'abc', lng: 7.39 }).valid).toBe(false);
    expect(validateCoordinates({ lat: 100, lng: 7.39 }, false).valid).toBe(false);
  });
});

describe('decodePolylineGeometry', () => {
  it('returns empty array for invalid input', () => {
    expect(decodePolylineGeometry(null)).toEqual([]);
    expect(decodePolylineGeometry('')).toEqual([]);
    expect(decodePolylineGeometry(123)).toEqual([]);
  });

  it('correctly decodes standard encoded polyline to [lng, lat] pairs', () => {
    // Encoded polyline for (38.5, -120.2) to (40.7, -120.95) to (43.252, -126.453)
    const testEncoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const coords = decodePolylineGeometry(testEncoded);
    expect(coords.length).toBe(3);
    // Note: GeoJSON order is [lng, lat]
    expect(coords[0][0]).toBeCloseTo(-120.2, 1);
    expect(coords[0][1]).toBeCloseTo(38.5, 1);
  });
});

describe('calculateRouteExposure', () => {
  const straightLineRoute = [
    [7.0, 9.0], // [lng, lat]
    [8.0, 9.0]
  ];

  const sampleIncidents = [
    {
      event_id: 'EVT-1',
      latitude: 9.01, // ~1.1km away from route
      longitude: 7.5,
      severity: 'Critical',
      verification_status: 'Verified',
      fatalities: 5,
      date: new Date().toISOString()
    },
    {
      event_id: 'EVT-2',
      latitude: 9.3, // ~33km away from route
      longitude: 7.5,
      severity: 'High',
      fatalities: 0,
      date: '2023-01-01'
    }
  ];

  it('identifies incidents strictly within corridor buffer', () => {
    const exposure5km = calculateRouteExposure({
      routeCoordinates: straightLineRoute,
      incidents: sampleIncidents,
      corridorDistanceKm: 5
    });

    expect(exposure5km.totalCount).toBe(1);
    expect(exposure5km.corridorIncidents[0].event_id).toBe('EVT-1');
    expect(exposure5km.criticalCount).toBe(1);
    expect(exposure5km.fatalities).toBe(5);
  });

  it('includes farther incidents when corridor distance is expanded', () => {
    const exposure50km = calculateRouteExposure({
      routeCoordinates: straightLineRoute,
      incidents: sampleIncidents,
      corridorDistanceKm: 50
    });

    expect(exposure50km.totalCount).toBe(2);
  });

  it('handles empty incident sets safely with an explicit uncertainty disclaimer', () => {
    const exposure = calculateRouteExposure({
      routeCoordinates: straightLineRoute,
      incidents: [],
      corridorDistanceKm: 5
    });

    expect(exposure.totalCount).toBe(0);
    expect(exposure.riskScore).toBe(0);
    expect(exposure.disclaimer).toContain('lack of reported data is not verification of complete safety');
  });

  it('handles invalid or empty route coordinates gracefully', () => {
    const exposure = calculateRouteExposure({
      routeCoordinates: [],
      incidents: sampleIncidents
    });

    expect(exposure.totalCount).toBe(0);
    expect(exposure.riskLevel).toBe('UNKNOWN');
  });
});

