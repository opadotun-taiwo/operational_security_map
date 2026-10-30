import * as turf from '@turf/turf';

/** Stroke / badge colors per corridor risk level, shared by the map and the route panel. */
export const RISK_COLORS = {
  LOW: '#22c55e',
  MODERATE: '#eab308',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
  UNKNOWN: '#94a3b8'
};

export const ALTERNATIVE_ROUTE_COLOR = '#94a3b8';

export function riskColor(riskLevel) {
  return RISK_COLORS[riskLevel] || RISK_COLORS.UNKNOWN;
}

/** Route A, B, C... so the map labels and the panel cards share one name. */
export function routeLetter(index) {
  return String.fromCharCode(65 + index);
}

function formatMinutes(totalMinutes) {
  const minutes = Math.round(Math.abs(totalMinutes));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Compares evaluated route alternatives and produces a plain-language recommendation.
 * Safest = lowest risk score, then fewest corridor incidents, then shortest time.
 *
 * @param {Array<Object>} routes - Routes carrying `exposure` and `durationSeconds`
 * @returns {{ safestIndex: number, fastestIndex: number, summary: string }}
 */
export function compareRoutes(routes = []) {
  if (routes.length === 0) {
    return { safestIndex: -1, fastestIndex: -1, summary: '' };
  }

  const duration = (r) => (Number.isFinite(r.durationSeconds) ? r.durationSeconds : Infinity);
  const score = (r) => r.exposure?.riskScore ?? 0;
  const count = (r) => r.exposure?.totalCount ?? 0;

  let safestIndex = 0;
  let fastestIndex = 0;
  routes.forEach((r, i) => {
    const best = routes[safestIndex];
    if (
      score(r) < score(best) ||
      (score(r) === score(best) && count(r) < count(best)) ||
      (score(r) === score(best) && count(r) === count(best) && duration(r) < duration(best))
    ) {
      safestIndex = i;
    }
    if (duration(r) < duration(routes[fastestIndex])) fastestIndex = i;
  });

  const safe = routes[safestIndex];
  const plural = (n) => `${n} incident${n === 1 ? '' : 's'}`;

  let summary;
  if (routes.length === 1) {
    summary = `Only one driving route was found for this trip, so there are no alternatives to compare. It has ${plural(count(safe))} recorded along the corridor.`;
  } else if (safestIndex === fastestIndex) {
    summary = `Route ${routeLetter(safestIndex)} is both the fastest and the least exposed option (${plural(count(safe))} along the corridor).`;
  } else {
    const fast = routes[fastestIndex];
    const fastLetter = routeLetter(fastestIndex);
    const extraMinutes = (duration(safe) - duration(fast)) / 60;
    const fewer = count(fast) - count(safe);
    const fewerText = fewer > 0 ? ` (${fewer} fewer than Route ${fastLetter})` : '';
    const timeText = Number.isFinite(extraMinutes) && extraMinutes >= 1
      ? ` It is about ${formatMinutes(extraMinutes)} slower than Route ${fastLetter}, the fastest.`
      : '';
    summary = `Route ${routeLetter(safestIndex)} has the lowest threat exposure: ${plural(count(safe))} along the corridor${fewerText}.${timeText}`;
  }

  return { safestIndex, fastestIndex, summary };
}

/**
 * Picks a label anchor for each route: the point on that route (within its middle
 * section) farthest from every other route, so labels for overlapping alternatives
 * sit where the routes actually diverge. Labels are kept apart from each other so
 * one never hides another when routes share most of the road.
 *
 * @param {Array<Object>} routes - Routes with `coordinates` as [lng, lat] pairs
 * @returns {Array<[number, number] | null>} One [lng, lat] anchor per route
 */
export function pickLabelPositions(routes = []) {
  const lines = routes.map(r => (r.coordinates?.length >= 2 ? turf.lineString(r.coordinates) : null));
  const placed = [];

  return routes.map((route, i) => {
    const coords = route.coordinates || [];
    if (coords.length === 0) return null;
    if (coords.length === 1) return coords[0];

    const start = Math.floor(coords.length * 0.15);
    const end = Math.max(start + 1, Math.ceil(coords.length * 0.85));
    const step = Math.max(1, Math.floor((end - start) / 60));
    const others = lines.filter((line, j) => j !== i && line);
    const minSeparationKm = Math.max(2, turf.length(lines[i], { units: 'kilometers' }) * 0.12);

    const candidates = [];
    for (let k = start; k < end; k += step) {
      const pt = turf.point(coords[k]);
      const divergence = others.length
        ? Math.min(...others.map(line => turf.pointToLineDistance(pt, line, { units: 'kilometers' })))
        : -Math.abs(k - coords.length / 2); // single route: prefer the midpoint
      const separation = placed.length
        ? Math.min(...placed.map(p => turf.distance(pt, turf.point(p), { units: 'kilometers' })))
        : Infinity;
      candidates.push({ coord: coords[k], divergence, separation });
    }

    const spaced = candidates.filter(c => c.separation >= minSeparationKm);
    const pool = spaced.length ? spaced : candidates;
    const best = pool.reduce((a, b) => {
      if (b.divergence !== a.divergence) return b.divergence > a.divergence ? b : a;
      return b.separation > a.separation ? b : a;
    });

    placed.push(best.coord);
    return best.coord;
  });
}

/**
 * Finds the nearest operational hub to an incident.
 *
 * @returns {{ nearestHubKm: number | null, nearestHubName: string | null }}
 */
export function nearestHub(event, hubs = []) {
  const lat = parseFloat(event.latitude);
  const lng = parseFloat(event.longitude);
  if (isNaN(lat) || isNaN(lng)) return { nearestHubKm: null, nearestHubName: null };

  const eventPoint = turf.point([lng, lat]);
  let nearestHubKm = null;
  let nearestHubName = null;
  for (const hub of hubs) {
    const hLat = parseFloat(hub.latitude);
    const hLng = parseFloat(hub.longitude);
    if (isNaN(hLat) || isNaN(hLng)) continue;
    const km = turf.distance(eventPoint, turf.point([hLng, hLat]), { units: 'kilometers' });
    if (nearestHubKm === null || km < nearestHubKm) {
      nearestHubKm = km;
      nearestHubName = hub.location_name || hub.name || null;
    }
  }
  return {
    nearestHubKm: nearestHubKm === null ? null : Math.round(nearestHubKm * 10) / 10,
    nearestHubName
  };
}
