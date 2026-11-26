import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import { calculateRouteExposure } from '../utils/routeExposure';
import {
  filterByLookback,
  sampleRoute,
  buildStretches,
  summarizeJourney,
  googleMapsDirectionsUrl,
  routeLengthKm
} from '../utils/journey';

const NOW = new Date('2026-11-26T12:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);

// A straight north–south road of ~100 km (0.9° of latitude) at longitude 7.4
const road = Array.from({ length: 10 }, (_, i) => [7.4, 9.0 + i * 0.1]);

describe('filterByLookback', () => {
  it('keeps only incidents inside the window', () => {
    const incidents = [{ date: daysAgo(10) }, { date: daysAgo(100) }, { date: null }];
    expect(filterByLookback(incidents, 90, NOW)).toHaveLength(1);
    expect(filterByLookback(incidents, null, NOW)).toHaveLength(3);
  });
});

describe('sampleRoute', () => {
  it('samples about every 10 km, start and end included', () => {
    const samples = sampleRoute(road);
    const length = routeLengthKm(road);
    expect(length).toBeGreaterThan(95);
    expect(samples[0].km).toBe(0);
    expect(samples[samples.length - 1].km).toBeCloseTo(length, 5);
    expect(samples.length).toBe(Math.ceil(length / 10) + 1);
  });

  it('caps the number of samples on long routes', () => {
    const long = [[3.4, 6.5], [7.4, 9.0], [8.5, 12.0]];
    expect(sampleRoute(long).length).toBeLessThanOrEqual(40);
  });
});

describe('buildStretches and summarizeJourney', () => {
  // First half in Bwari (FCT), second half in Kachia (Kaduna)
  const samples = sampleRoute(road).map(s => (s.km < 50 ? { ...s, lga: 'Bwari', state: 'FCT' } : { ...s, lga: 'Kachia', state: 'Kaduna' }));
  const incidents = [
    { event_id: 'a', latitude: 9.71, longitude: 7.41, date: daysAgo(5), severity: 'Critical', event_type: 'Kidnapping' },
    { event_id: 'b', latitude: 9.81, longitude: 7.42, date: daysAgo(12), severity: 'High', event_type: 'Kidnapping' },
    { event_id: 'c', latitude: 9.61, longitude: 7.39, date: daysAgo(20), severity: 'High', event_type: 'Banditry' },
    { event_id: 'far', latitude: 9.2, longitude: 8.2, date: daysAgo(3), severity: 'Critical', event_type: 'Kidnapping' }
  ];
  const exposure = calculateRouteExposure({ routeCoordinates: road, incidents, corridorDistanceKm: 5 });
  const stretches = buildStretches(road, samples, exposure.corridorIncidents, 5);

  it('splits the route where the LGA changes and assigns incidents in travel order', () => {
    expect(stretches.map(s => s.label)).toEqual(['Bwari, FCT', 'Kachia, Kaduna']);
    expect(stretches[0].startKm).toBe(0);
    expect(stretches[0].endKm).toBe(stretches[1].startKm);
    expect(stretches[0].incidents).toHaveLength(0);
    expect(stretches[1].incidents.map(i => i.event_id)).toEqual(['c', 'a', 'b']);
    expect(stretches[1].exposure.riskLevel).toBe('CRITICAL');
    expect(stretches[1].topTypes[0]).toEqual({ type: 'Kidnapping', count: 2 });
  });

  it('names the highest-risk stretch and flags states outside the footprint', () => {
    const summary = summarizeJourney(stretches, { corridorDistanceKm: 5, lookbackLabel: '90 days', operatingStates: ['FCT', 'Niger'] });
    expect(summary.headline).toMatch(/^Highest-risk stretch: km \d+–\d+ through Kachia, Kaduna \(3 incidents: 2 kidnapping, 1 banditry in the last 90 days\)\.$/);
    expect(summary.advice).toMatch(/daylight/);
    expect(summary.outsideStates).toEqual(['Kaduna']);
  });

  it('never calls an empty route safe', () => {
    const empty = buildStretches(road, samples, [], 5);
    const summary = summarizeJourney(empty, { corridorDistanceKm: 5, lookbackLabel: '90 days' });
    expect(summary.headline).toBe('No incidents recorded within 5 km of this route in the last 90 days.');
    expect(summary.advice).toMatch(/does not guarantee/);
  });

  it('folds tiny urban stretches into their neighbour', () => {
    const flicker = sampleRoute(road).map((s, i) => ({ ...s, lga: i === 3 ? 'Tiny' : 'Bwari', state: 'FCT' }));
    // a single 10 km sample is longer than the 4 km minimum, so build a denser case
    const dense = sampleRoute(road, { spacingKm: 1, maxSamples: 200 }).map((s, i) => ({ ...s, lga: i === 30 ? 'Tiny' : 'Bwari', state: 'FCT' }));
    expect(buildStretches(road, flicker, [], 5).map(s => s.lgas)).toEqual([['Bwari'], ['Tiny'], ['Bwari']]);
    expect(buildStretches(road, dense, [], 5).map(s => s.lgas)).toEqual([['Bwari', 'Tiny']]);
  });
});

describe('googleMapsDirectionsUrl', () => {
  it('builds a driving link with waypoints along the route', () => {
    const url = new URL(googleMapsDirectionsUrl({ lat: 9.0, lng: 7.4 }, { lat: 9.9, lng: 7.4 }, road));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('travelmode')).toBe('driving');
    expect(url.searchParams.get('waypoints').split('|')).toHaveLength(3);
  });
});

it('turf sanity: road is a valid line', () => {
  expect(turf.lineString(road).geometry.type).toBe('LineString');
});
