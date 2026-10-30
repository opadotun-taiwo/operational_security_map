import * as turf from '@turf/turf';

/** States outside current hub coverage where expansion is being considered. */
export const EXPANSION_STATES = ['Jigawa', 'Gombe', 'Oyo', 'Kano'];

/** Max distance for borrowing a nearby incident's state when a hub has none recorded. */
const HUB_STATE_FALLBACK_KM = 50;

/**
 * Normalizes a Nigerian state name for comparison: case, spacing and a trailing
 * "State" are ignored, and the many spellings of the FCT collapse to one key.
 */
export function canonicalState(name) {
  const key = String(name || '')
    .toLowerCase()
    .replace(/\bstate\b/g, '')
    .replace(/[^a-z]/g, '');
  if (!key) return '';
  if (['fct', 'abuja', 'federalcapitalterritory', 'fctabuja', 'abujafct'].includes(key)) return 'fct';
  if (key === 'nassarawa') return 'nasarawa';
  return key;
}

function hubState(hub, events) {
  if (hub.state) return hub.state;
  // Some hub rows have no state: borrow it from the closest incident nearby
  const lat = parseFloat(hub.latitude);
  const lng = parseFloat(hub.longitude);
  if (isNaN(lat) || isNaN(lng)) return null;
  const hubPoint = turf.point([lng, lat]);
  let best = null;
  for (const e of events) {
    const eLat = parseFloat(e.latitude);
    const eLng = parseFloat(e.longitude);
    if (!e.state || isNaN(eLat) || isNaN(eLng)) continue;
    const km = turf.distance(hubPoint, turf.point([eLng, eLat]), { units: 'kilometers' });
    if (km <= HUB_STATE_FALLBACK_KM && (!best || km < best.km)) best = { km, state: e.state };
  }
  return best?.state || null;
}

/**
 * The states whose incidents the dashboard shows: every state with an operational
 * hub, plus the expansion states.
 *
 * @returns {{ hubStates: string[], expansionStates: string[], all: string[], keys: Set<string> }}
 *   Display names, using the spelling found in the incident data where possible.
 */
export function getOperatingStates(hubs = [], events = []) {
  const spelling = {};
  for (const e of events) {
    const key = canonicalState(e.state);
    if (key && !spelling[key]) spelling[key] = e.state;
  }
  // Hub states use the incident data's spelling so the State filter matches the data
  const display = (name) => spelling[canonicalState(name)] || String(name).replace(/\s+state$/i, '').trim();

  const hubKeys = new Set();
  const hubStates = [];
  for (const hub of hubs) {
    const state = hubState(hub, events);
    const key = canonicalState(state);
    if (key && !hubKeys.has(key)) {
      hubKeys.add(key);
      hubStates.push(display(state));
    }
  }

  const expansionStates = EXPANSION_STATES.filter(s => !hubKeys.has(canonicalState(s)));
  const all = [...hubStates, ...expansionStates].sort((a, b) => a.localeCompare(b));
  return {
    hubStates: hubStates.sort((a, b) => a.localeCompare(b)),
    expansionStates,
    all,
    keys: new Set(all.map(canonicalState))
  };
}

/** True when an incident's state is one of the operating states. */
export function isInOperatingStates(event, operatingStates) {
  return operatingStates.keys.has(canonicalState(event.state));
}

/** Returns the operating-state display name matching `name`, or null. */
export function matchOperatingState(name, operatingStates) {
  const key = canonicalState(name);
  return operatingStates.all.find(s => canonicalState(s) === key) || null;
}
