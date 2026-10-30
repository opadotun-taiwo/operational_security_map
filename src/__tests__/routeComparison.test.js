import { describe, it, expect } from 'vitest';
import { compareRoutes, pickLabelPositions, nearestHub, routeLetter } from '../utils/routeComparison';

const route = (riskScore, totalCount, durationSeconds) => ({
  durationSeconds,
  exposure: { riskScore, totalCount }
});

describe('compareRoutes', () => {
  it('recommends the lowest-risk route and reports the time trade-off', () => {
    const result = compareRoutes([route(80, 3, 3600), route(20, 1, 4320)]);
    expect(result.safestIndex).toBe(1);
    expect(result.fastestIndex).toBe(0);
    expect(result.summary).toBe('Route B has the lowest threat exposure: 1 incident along the corridor (2 fewer than Route A). It is about 12 min slower than Route A, the fastest.');
  });

  it('breaks risk ties by incident count, then by duration', () => {
    expect(compareRoutes([route(10, 2, 100), route(10, 1, 200)]).safestIndex).toBe(1);
    expect(compareRoutes([route(10, 1, 300), route(10, 1, 200)]).safestIndex).toBe(1);
  });

  it('says when the fastest route is also the safest', () => {
    const result = compareRoutes([route(5, 0, 3000), route(40, 2, 3600)]);
    expect(result.summary).toMatch(/^Route A is both the fastest and the least exposed/);
  });

  it('explains when there are no alternatives', () => {
    expect(compareRoutes([route(5, 1, 3000)]).summary).toMatch(/Only one driving route/);
  });
});

describe('pickLabelPositions', () => {
  it('anchors labels where routes diverge', () => {
    const shared = [[0, 0], [0, 1]];
    const a = { coordinates: [...shared, [0, 2], [0, 3], [0, 4], [0, 5]] };
    const b = { coordinates: [...shared, [1, 2], [1, 3], [1, 4], [0, 5]] };
    const [labelA, labelB] = pickLabelPositions([a, b]);
    expect(labelA[0]).toBe(0);
    expect(labelB[0]).toBe(1);
  });

  it('keeps labels apart when routes share the same road', () => {
    const road = Array.from({ length: 21 }, (_, k) => [0, k * 0.05]);
    const [labelA, labelB] = pickLabelPositions([{ coordinates: road }, { coordinates: road }]);
    expect(Math.abs(labelA[1] - labelB[1])).toBeGreaterThan(0.1);
  });

  it('uses the midpoint for a single route', () => {
    expect(pickLabelPositions([{ coordinates: [[0, 0], [0, 1], [0, 2]] }])[0]).toEqual([0, 1]);
  });
});

describe('nearestHub', () => {
  it('returns the closest hub and distance in km', () => {
    const hubs = [
      { latitude: 9.62, longitude: 6.55, location_name: 'Minna' },
      { latitude: 9.08, longitude: 6.01, location_name: 'Bida' }
    ];
    const result = nearestHub({ latitude: 9.1, longitude: 6.02 }, hubs);
    expect(result.nearestHubName).toBe('Bida');
    expect(result.nearestHubKm).toBeLessThan(3);
  });

  it('handles events without coordinates', () => {
    expect(nearestHub({}, [])).toEqual({ nearestHubKm: null, nearestHubName: null });
  });
});

it('letters routes A, B, C', () => {
  expect([0, 1, 2].map(routeLetter)).toEqual(['A', 'B', 'C']);
});
