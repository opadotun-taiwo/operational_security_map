import { describe, it, expect } from 'vitest';
import { annotateHubThreats } from '../utils/hubThreats';

const NOW = new Date('2026-10-30T12:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);
const hub = { id: 1, latitude: 9.62, longitude: 6.55, location_name: 'Minna' };
// ~1 km from the hub
const near = (date) => ({ id: date, latitude: 9.625, longitude: 6.555, date });

describe('annotateHubThreats', () => {
  it('flags a hub for a nearby incident within the last 6 weeks', () => {
    const { events, hubs } = annotateHubThreats([near(daysAgo(41))], [hub], NOW);
    expect(events[0].isNearHub).toBe(true);
    expect(hubs[0].isThreatened).toBe(true);
  });

  it('clears the hub alert once the incident is older than 6 weeks', () => {
    const { events, hubs } = annotateHubThreats([near(daysAgo(43))], [hub], NOW);
    expect(events[0].isNearHub).toBe(false);
    expect(events[0].isRecent).toBe(true); // still highlighted as recent (90 days) on the map
    expect(hubs[0].isThreatened).toBe(false);
  });

  it('ignores recent incidents further than 5 km away', () => {
    const far = { id: 9, latitude: 9.8, longitude: 6.55, date: daysAgo(3) };
    const { events, hubs } = annotateHubThreats([far], [hub], NOW);
    expect(events[0].isNearHub).toBe(false);
    expect(hubs[0].isThreatened).toBe(false);
    expect(events[0].nearestHubName).toBe('Minna');
  });

  it('handles incidents without a date or coordinates', () => {
    const { events, hubs } = annotateHubThreats([{ id: 1 }, { id: 2, latitude: 9.62, longitude: 6.55 }], [hub], NOW);
    expect(events.every(e => !e.isNearHub && !e.isRecent)).toBe(true);
    expect(hubs[0].isThreatened).toBe(false);
  });
});
