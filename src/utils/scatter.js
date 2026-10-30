const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** FNV-1a hash of a string, used to seed per-incident randomness. */
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32), so the scatter is identical on every render. */
function seededRandom(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const incidentId = (event) => String(event.event_id ?? event.id ?? '');

/**
 * Incidents recorded at the same coordinates (often an LGA or town centre) would sit
 * exactly on top of each other. Spreads each such group into an irregular scatter
 * around the shared point (pixel offsets) so every incident can be seen and clicked.
 *
 * The layout is a jittered sunflower spiral: evenly filled, no rings, and stable for
 * the same incidents because the randomness is seeded by their IDs.
 *
 * @param {Array<Object>} incidents
 * @param {{ spacingPx?: number }} [options] - Typical gap between neighbouring dots
 * @returns {Array<{ event: Object, offset: [number, number] | null, sharedCount: number }>}
 */
export function scatterOverlapping(incidents, { spacingPx = 13 } = {}) {
  const groups = {};
  for (const event of incidents) {
    const lat = parseFloat(event.latitude);
    const lng = parseFloat(event.longitude);
    if (isNaN(lat) || isNaN(lng)) continue;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    (groups[key] ||= []).push(event);
  }

  const result = [];
  for (const group of Object.values(groups)) {
    if (group.length === 1) {
      result.push({ event: group[0], offset: null, sharedCount: 1 });
      continue;
    }

    // Stable order and seed regardless of how the incidents arrived
    const sorted = [...group].sort((a, b) => incidentId(a).localeCompare(incidentId(b)));
    const random = seededRandom(hashString(sorted.map(incidentId).join('|')));
    const rotation = random() * Math.PI * 2;

    sorted.forEach((event, i) => {
      // Sunflower spiral spacing, then jitter angle and radius so no pattern shows
      const radius = spacingPx * Math.sqrt(i + 0.6) * (0.75 + random() * 0.5);
      const angle = rotation + i * GOLDEN_ANGLE + (random() - 0.5) * 1.2;
      result.push({
        event,
        offset: [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)],
        sharedCount: sorted.length
      });
    });
  }
  return result;
}
