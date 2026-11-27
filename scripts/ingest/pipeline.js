// Pure helpers for the daily incident collection: the AI extraction schema, cleaning a
// candidate into the security_events format, and duplicate detection. No network access.

import {
  SEVERITY_OPTIONS,
  CONFIDENCE_OPTIONS,
  DEFAULT_EVENT_TYPES,
  normalizeDate
} from '../../src/utils/incidentSchema.js';
import { canonicalState } from '../../src/utils/operatingStates.js';

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });

/**
 * JSON schema the AI fills from its research notes. Coordinates, event IDs and the
 * reported date are deliberately not asked for: the job sets them itself.
 */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'date', 'state', 'lga', 'location', 'event_type', 'severity', 'description',
          'fatalities', 'injured', 'abducted', 'actors', 'source', 'source_url', 'source_date',
          'confidence'
        ],
        properties: {
          date: nullable({ type: 'string', description: 'Date the incident happened, YYYY-MM-DD' }),
          state: nullable({ type: 'string', description: 'Nigerian state, e.g. "Kaduna" or "FCT"' }),
          lga: nullable({ type: 'string', description: 'Local government area' }),
          location: nullable({ type: 'string', description: 'Community, village, town, road or landmark' }),
          event_type: { type: 'string', enum: DEFAULT_EVENT_TYPES },
          severity: { type: 'string', enum: SEVERITY_OPTIONS },
          description: { type: 'string', description: '1-2 factual sentences: what happened, where, impact' },
          fatalities: nullable({ type: 'integer' }),
          injured: nullable({ type: 'integer' }),
          abducted: nullable({ type: 'integer' }),
          actors: nullable({ type: 'string' }),
          source: nullable({ type: 'string', description: 'Outlet or agency name' }),
          source_url: nullable({ type: 'string', description: 'Link to the original report' }),
          source_date: nullable({ type: 'string', description: 'Publication date, YYYY-MM-DD' }),
          confidence: { type: 'string', enum: CONFIDENCE_OPTIONS }
        }
      }
    }
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

function text(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  return v === '' || v.toLowerCase() === 'null' || v.toLowerCase() === 'unknown' ? null : v;
}

function count(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function option(value, options) {
  const v = text(value);
  return v ? options.find(o => o.toLowerCase() === v.toLowerCase()) || null : null;
}

/** Dates must be real, not in the future, and within the last 5 years. */
function recentDate(value, now) {
  const iso = normalizeDate(value);
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(t) || t > now + DAY_MS || t < now - 5 * 365 * DAY_MS) return null;
  return iso;
}

/** Strips tracking parameters and cosmetic differences so the same article matches. */
export function normalizeUrl(url) {
  const raw = text(url);
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|amp$|ref$)/i.test(key)) u.searchParams.delete(key);
    }
    const path = u.pathname.replace(/\/amp\/?$/i, '/').replace(/\/+$/, '');
    return `${u.hostname.replace(/^www\./i, '').toLowerCase()}${path}${u.search}`;
  } catch {
    return null;
  }
}

/**
 * Cleans one AI candidate into security_events fields (without coordinates or event_id).
 *
 * @returns {{ incident: Object | null, reason: string | null }}
 */
export function cleanCandidate(raw, { now = Date.now() } = {}) {
  const date = recentDate(raw.date, now) || recentDate(raw.source_date, now);
  if (!date) return { incident: null, reason: 'no valid incident date' };

  const state = text(raw.state);
  if (!state) return { incident: null, reason: 'no state' };

  const description = text(raw.description);
  if (!description) return { incident: null, reason: 'no description' };

  const sourceUrl = text(raw.source_url);
  const incident = {
    date,
    state: state.replace(/\s+state$/i, '').trim(),
    lga: text(raw.lga),
    location: text(raw.location),
    event_type: option(raw.event_type, DEFAULT_EVENT_TYPES) || 'Other',
    severity: option(raw.severity, SEVERITY_OPTIONS) || 'Medium',
    description,
    fatalities: count(raw.fatalities),
    injured: count(raw.injured),
    abducted: count(raw.abducted),
    actors: text(raw.actors) || 'Unknown',
    source: text(raw.source),
    source_url: sourceUrl && /^https?:\/\/\S+\.\S+/i.test(sourceUrl) ? sourceUrl : null,
    source_date: recentDate(raw.source_date, now),
    confidence: option(raw.confidence, CONFIDENCE_OPTIONS) || 'Low',
    // Only the risk team verifies (Review tab); collected incidents always start unverified
    verification_status: 'Unverified'
  };
  return { incident, reason: null };
}

const placeKey = (s) => String(s || '').toLowerCase().replace(/\s+(lga|local government( area)?)$/i, '').replace(/[^a-z0-9]/g, '');

/**
 * True when two records describe the same event: the same article, or the same type of
 * incident in the same state and LGA (or community) within a day of each other.
 */
export function isSameIncident(a, b) {
  const urlA = normalizeUrl(a.source_url);
  if (urlA && urlA === normalizeUrl(b.source_url)) return true;

  const dateA = normalizeDate(a.date);
  const dateB = normalizeDate(b.date);
  if (!dateA || !dateB) return false;
  const days = Math.abs(new Date(dateA) - new Date(dateB)) / DAY_MS;
  if (days > 1) return false;
  if (canonicalState(a.state) !== canonicalState(b.state)) return false;
  if (String(a.event_type || '').toLowerCase() !== String(b.event_type || '').toLowerCase()) return false;

  const lgaA = placeKey(a.lga);
  const lgaB = placeKey(b.lga);
  if (lgaA && lgaB) return lgaA === lgaB;
  const locA = placeKey(a.location);
  const locB = placeKey(b.location);
  return Boolean(locA && locB && (locA === locB || locA.includes(locB) || locB.includes(locA)));
}

/**
 * Splits candidates into new incidents and duplicates (of existing rows or of each other).
 *
 * @returns {{ fresh: Array<Object>, duplicates: Array<{ incident: Object, of: Object }> }}
 */
export function removeDuplicates(candidates, existing) {
  const fresh = [];
  const duplicates = [];
  for (const incident of candidates) {
    const match = existing.find(e => isSameIncident(incident, e)) || fresh.find(e => isSameIncident(incident, e));
    if (match) duplicates.push({ incident, of: match });
    else fresh.push(incident);
  }
  return { fresh, duplicates };
}

/** Today and yesterday in Nigeria (WAT, UTC+1), as YYYY-MM-DD. */
export function nigeriaDates(now = Date.now()) {
  const watNow = now + 60 * 60 * 1000;
  const today = new Date(watNow).toISOString().slice(0, 10);
  const yesterday = new Date(watNow - DAY_MS).toISOString().slice(0, 10);
  return { today, yesterday };
}

/** The geocoding queries to try, most precise first, each with its precision level. */
export function geocodeQueries(incident) {
  const parts = (...xs) => xs.filter(Boolean).join(', ');
  const queries = [];
  if (incident.location) queries.push({ level: 'community', query: parts(incident.location, incident.lga, incident.state, 'Nigeria') });
  if (incident.lga) queries.push({ level: 'lga', query: parts(incident.lga, incident.state, 'Nigeria') });
  queries.push({ level: 'state', query: parts(`${incident.state} State`, 'Nigeria') });
  return queries;
}
