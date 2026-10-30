import { describe, it, expect } from 'vitest';
import { scatterOverlapping } from '../utils/scatter';

const at = (id, lat = 9.6, lng = 6.55) => ({ event_id: `EVT${id}`, latitude: lat, longitude: lng });

describe('scatterOverlapping', () => {
  it('leaves incidents at distinct locations where they are', () => {
    const out = scatterOverlapping([at(1, 9.6), at(2, 9.7)]);
    expect(out.map(o => o.offset)).toEqual([null, null]);
  });

  it('spreads same-location incidents into a scatter, not a ring', () => {
    const group = Array.from({ length: 20 }, (_, i) => at(i));
    const out = scatterOverlapping(group);
    const distances = out.map(o => Math.hypot(...o.offset));

    // Every dot is moved, and no two dots land on the same pixel
    expect(distances.every(d => d > 0)).toBe(true);
    expect(new Set(out.map(o => o.offset.join(','))).size).toBe(20);

    // A ring would put every dot at (nearly) the same distance from the centre;
    // a scatter fills the area, so distances vary widely
    const min = Math.min(...distances);
    const max = Math.max(...distances);
    expect(max / min).toBeGreaterThan(3);
    expect(out.every(o => o.sharedCount === 20)).toBe(true);
  });

  it('is stable for the same incidents in any order', () => {
    const group = Array.from({ length: 6 }, (_, i) => at(i));
    const a = scatterOverlapping(group);
    const b = scatterOverlapping([...group].reverse());
    const byId = (list) => Object.fromEntries(list.map(o => [o.event.event_id, o.offset.join(',')]));
    expect(byId(a)).toEqual(byId(b));
  });
});
