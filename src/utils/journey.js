import * as turf from '@turf/turf';
import { calculateRouteExposure } from './routeExposure';
import { canonicalState } from './operatingStates';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Look back" choices for route checks. `null` days = all records. */
export const LOOKBACK_OPTIONS = [
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: '365', label: '12 months', days: 365 },
  { id: 'all', label: 'All', days: null }
];
export const DEFAULT_LOOKBACK = '90';

export function lookbackDays(id) {
  return LOOKBACK_OPTIONS.find(o => o.id === id)?.days ?? null;
}

/** Keeps incidents dated within the look-back window (undated ones only for "All"). */
export function filterByLookback(incidents, days, now = Date.now()) {
  if (!days) return incidents;
  const cutoff = now - days * DAY_MS;
  return incidents.filter(e => {
    const t = e.date ? new Date(e.date).getTime() : NaN;
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function routeLengthKm(coordinates) {
  if (!coordinates || coordinates.length < 2) return 0;
  return turf.length(turf.lineString(coordinates), { units: 'kilometers' });
}

/**
 * Points along the route used to find which LGA each part of the road passes through.
 * Roughly every 10 km, never more than `maxSamples` (to bound geocoding requests).
 *
 * @returns {Array<{ km: number, point: [number, number] }>}
 */
export function sampleRoute(coordinates, { spacingKm = 10, maxSamples = 40 } = {}) {
  const length = routeLengthKm(coordinates);
  if (length === 0) return [];
  const line = turf.lineString(coordinates);
  const count = Math.min(maxSamples, Math.max(2, Math.ceil(length / spacingKm) + 1));
  const step = length / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const km = Math.min(length, i * step);
    return { km, point: turf.along(line, km, { units: 'kilometers' }).geometry.coordinates };
  });
}

const placeKey = (s) => `${(s.lga || '').toLowerCase()}|${canonicalState(s.state)}`;

function placeLabel(lgas, state) {
  const names = lgas.filter(Boolean);
  const where = names.length > 2 ? `${names[0]} → ${names[names.length - 1]}` : names.join(' → ');
  return [where, state].filter(Boolean).join(', ') || 'Unnamed area';
}

/**
 * Splits a route into stretches by the LGA it passes through and scores each one.
 *
 * @param {Array<[number, number]>} coordinates - Route geometry
 * @param {Array<{ km: number, lga?: string, state?: string }>} samples - Labelled route samples
 * @param {Array<Object>} corridorIncidents - From calculateRouteExposure (with alongRouteKm)
 * @param {number} corridorDistanceKm
 * @returns {Array<Object>} Stretches in travel order:
 *   { startKm, endKm, label, state, lgas, coordinates, incidents, exposure, topTypes }
 */
export function buildStretches(coordinates, samples, corridorIncidents, corridorDistanceKm) {
  const length = routeLengthKm(coordinates);
  if (length === 0 || !samples?.length) return [];
  const line = turf.lineString(coordinates);

  // 1. Group consecutive samples in the same LGA; boundaries fall halfway between samples
  const groups = [];
  samples.forEach((s, i) => {
    const prev = groups[groups.length - 1];
    if (prev && placeKey(prev.sample) === placeKey(s)) {
      prev.last = i;
    } else {
      groups.push({ sample: s, first: i, last: i });
    }
  });
  let stretches = groups.map((g, i) => {
    const startKm = i === 0 ? 0 : (samples[g.first - 1].km + samples[g.first].km) / 2;
    const endKm = i === groups.length - 1 ? length : (samples[g.last].km + samples[g.last + 1].km) / 2;
    return { startKm, endKm, lgas: [g.sample.lga || ''], state: g.sample.state || '' };
  });

  // 2. Fold very short stretches (urban LGA hopping) into the previous one
  const minKm = Math.max(3, length * 0.04);
  const merged = [];
  for (const st of stretches) {
    const prev = merged[merged.length - 1];
    const tooShort = prev && (st.endKm - st.startKm < minKm || prev.endKm - prev.startKm < minKm);
    // After a fold, the road may come back into the LGA it was already in: rejoin it
    const samePlace = prev && prev.lgas.includes(st.lgas[0]) && canonicalState(prev.state) === canonicalState(st.state);
    if (tooShort || samePlace) {
      prev.endKm = st.endKm;
      if (!prev.lgas.includes(st.lgas[0])) prev.lgas.push(st.lgas[0]);
      if (!prev.state) prev.state = st.state;
    } else {
      merged.push({ ...st, lgas: [...st.lgas] });
    }
  }
  stretches = merged;

  // 3. Score each stretch from the corridor incidents that sit along it
  return stretches.map((st, i) => {
    const isLast = i === stretches.length - 1;
    const incidents = corridorIncidents.filter(inc =>
      inc.alongRouteKm >= st.startKm && (isLast ? inc.alongRouteKm <= st.endKm + 0.1 : inc.alongRouteKm < st.endKm)
    );
    const slice = turf.lineSliceAlong(line, st.startKm, Math.max(st.endKm, st.startKm + 0.01), { units: 'kilometers' }).geometry.coordinates;
    const exposure = calculateRouteExposure({ routeCoordinates: slice, incidents, corridorDistanceKm });
    const typeCounts = {};
    for (const inc of incidents) {
      const t = inc.event_type || 'Incident';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([type, count]) => ({ type, count }));
    return {
      startKm: Math.round(st.startKm),
      endKm: Math.round(st.endKm),
      lgas: st.lgas.filter(Boolean),
      state: st.state,
      label: placeLabel(st.lgas, st.state),
      coordinates: slice,
      incidents: [...incidents].sort((a, b) => a.alongRouteKm - b.alongRouteKm),
      exposure,
      topTypes
    };
  });
}

/**
 * Plain-language guidance for a route from its stretches.
 *
 * @returns {{ headline: string, advice: string | null, outsideStates: string[] }}
 */
export function summarizeJourney(stretches, { corridorDistanceKm, lookbackLabel, operatingStates = [] } = {}) {
  const window = lookbackLabel ? ` in the last ${lookbackLabel}` : '';
  const opKeys = new Set(operatingStates.map(canonicalState));
  const outsideStates = Array.from(new Set(
    stretches.map(s => s.state).filter(s => s && opKeys.size && !opKeys.has(canonicalState(s)))
  ));

  const withIncidents = stretches.filter(s => s.incidents.length > 0);
  if (withIncidents.length === 0) {
    return {
      headline: `No incidents recorded within ${corridorDistanceKm} km of this route${window}.`,
      advice: 'This does not guarantee the road is safe. Check with the risk team before travelling to unfamiliar areas.',
      outsideStates
    };
  }

  const worst = withIncidents.reduce((a, b) =>
    (b.exposure.riskScore > a.exposure.riskScore || (b.exposure.riskScore === a.exposure.riskScore && b.incidents.length > a.incidents.length)) ? b : a
  );
  const types = worst.topTypes.map(t => `${t.count} ${t.type.toLowerCase()}`).join(', ');
  const headline = `Highest-risk stretch: km ${worst.startKm}–${worst.endKm} through ${worst.label} ` +
    `(${worst.incidents.length} incident${worst.incidents.length === 1 ? '' : 's'}${types ? `: ${types}` : ''}${window}).`;

  const serious = ['HIGH', 'CRITICAL'].includes(worst.exposure.riskLevel);
  const advice = serious
    ? 'Travel this stretch in daylight, avoid stopping on it, and confirm the situation with the risk team before you set off.'
    : `${withIncidents.length} of ${stretches.length} stretches have recorded incidents. Stay alert on the coloured stretches on the map.`;

  return { headline, advice, outsideStates };
}

/**
 * Google Maps directions link for the selected route. A few points along the route are
 * passed as waypoints so Google Maps follows the same road rather than its own choice.
 */
export function googleMapsDirectionsUrl(origin, destination, coordinates) {
  const fmt = (lat, lng) => `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
  const params = new URLSearchParams({
    api: '1',
    origin: fmt(origin.lat, origin.lng),
    destination: fmt(destination.lat, destination.lng),
    travelmode: 'driving'
  });
  const length = routeLengthKm(coordinates);
  if (length > 20) {
    const line = turf.lineString(coordinates);
    const waypoints = [0.25, 0.5, 0.75].map(f => {
      const [lng, lat] = turf.along(line, length * f, { units: 'kilometers' }).geometry.coordinates;
      return fmt(lat, lng);
    });
    params.set('waypoints', waypoints.join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
