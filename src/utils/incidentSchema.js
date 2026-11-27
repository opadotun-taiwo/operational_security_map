import { canonicalState } from './operatingStates.js';

/**
 * security_events schema, validation, event IDs and CSV handling. Pure functions with no
 * browser or Supabase dependencies, shared by the web app and the daily ingest job
 * (scripts/ingest). Keep in sync with the table structure.
 */

// ---------------------------------------------------------------------------
// security_events schema
// ---------------------------------------------------------------------------

/** Columns of security_events in table order (created_at is set by the database). */
export const SCHEMA_COLUMNS = [
  'event_id', 'date', 'state', 'lga', 'location', 'latitude', 'longitude', 'event_type', 'severity',
  'description', 'fatalities', 'injured', 'abducted', 'actors', 'source', 'source_url', 'source_date',
  'reported_date', 'confidence', 'verification_status'
];

export const SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
export const CONFIDENCE_OPTIONS = ['High', 'Medium', 'Low'];
export const VERIFICATION_OPTIONS = ['Verified', 'Partially Verified', 'Unverified', 'Disputed'];
/** Standard incident types (same list as the automated news collection). */
export const DEFAULT_EVENT_TYPES = [
  'Kidnapping', 'Banditry', 'Terrorist Attack', 'Insurgency', 'Armed Attack', 'Armed Robbery',
  'Communal Violence', 'Farmer-Herder Conflict', 'Cult Violence', 'Civil Unrest', 'Riot',
  'Road Attack', 'Explosion', 'Militancy', 'Security Operation', 'Other'
];

/** Form/CSV field rules. `auto` fields are filled in when left blank. */
export const INCIDENT_FIELDS = {
  event_id: { label: 'Event ID', auto: true },
  date: { label: 'Date of incident', type: 'date', required: true },
  state: { label: 'State', required: true },
  lga: { label: 'LGA', required: true },
  location: { label: 'Location' },
  latitude: { label: 'Latitude', type: 'number', required: true },
  longitude: { label: 'Longitude', type: 'number', required: true },
  event_type: { label: 'Event type', required: true },
  severity: { label: 'Severity', required: true, options: SEVERITY_OPTIONS },
  description: { label: 'Description', required: true },
  fatalities: { label: 'Fatalities', type: 'integer' },
  injured: { label: 'Injured', type: 'integer' },
  abducted: { label: 'Abducted', type: 'integer' },
  actors: { label: 'Actors' },
  source: { label: 'Source', required: true },
  source_url: { label: 'Source link', type: 'url' },
  source_date: { label: 'Source date', type: 'date' },
  reported_date: { label: 'Reported date', type: 'date', auto: true },
  confidence: { label: 'Confidence', required: true, options: CONFIDENCE_OPTIONS },
  verification_status: { label: 'Verification status', required: true, options: VERIFICATION_OPTIONS }
};

const EVENT_ID_PATTERN = /^EVT\d{8}\d{3,}$/;

const isoDate = (time) => new Date(time).toISOString().slice(0, 10);

/** Blank, whitespace and the literal "null" (as exported by Supabase) are empty. */
function clean(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY and Excel-style dates; returns YYYY-MM-DD or null. */
export function normalizeDate(value) {
  const v = clean(value);
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // Nigerian convention: day first
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function validDate(iso) {
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d) && isoDate(d) === iso;
}

/**
 * Next free event ID for an incident date, following the table's EVT<YYYYMMDD><NNN> format.
 * `takenIds` is updated so a batch never reuses an ID.
 */
export function nextEventId(date, takenIds) {
  const prefix = `EVT${date.replace(/-/g, '')}`;
  let max = 0;
  for (const id of takenIds) {
    if (typeof id === 'string' && id.startsWith(prefix)) {
      const seq = parseInt(id.slice(prefix.length), 10);
      if (seq > max) max = seq;
    }
  }
  const id = `${prefix}${String(max + 1).padStart(3, '0')}`;
  takenIds.add(id);
  return id;
}

function matchOption(value, options) {
  return options.find(o => o.toLowerCase() === value.toLowerCase()) || null;
}

/**
 * Validates one incident (from the form or a CSV row) and builds the row to insert.
 *
 * @param {Object} values - Raw values keyed by column name
 * @param {Object} options
 * @param {string[]} [options.operatingStates] - Allowed state names; others are rejected
 * @param {Set<string>} [options.takenIds] - Existing event IDs (updated with the new ID)
 * @param {string[] | null} [options.columns] - Live table columns, when known
 * @param {number} [options.now]
 * @returns {{ record: Object | null, errors: Object<string, string> }}
 */
export function buildIncidentRecord(values, { operatingStates = null, takenIds = new Set(), columns = null, now = Date.now() } = {}) {
  const errors = {};
  const record = {};
  const today = isoDate(now);

  for (const [key, field] of Object.entries(INCIDENT_FIELDS)) {
    if (field.auto) continue;
    const raw = clean(values[key]);
    if (raw === null) {
      if (field.required) errors[key] = `${field.label} is required`;
      continue;
    }

    if (field.type === 'number' || field.type === 'integer') {
      const num = Number(raw.replace(/,/g, ''));
      if (!Number.isFinite(num)) {
        errors[key] = `${field.label} must be a number`;
      } else if (field.type === 'integer' && (!Number.isInteger(num) || num < 0)) {
        errors[key] = `${field.label} must be a whole number (0 or more)`;
      } else {
        record[key] = num;
      }
    } else if (field.type === 'date') {
      const iso = normalizeDate(raw);
      if (!validDate(iso)) errors[key] = `${field.label} must be a date like 2026-10-30`;
      else if (iso > today) errors[key] = `${field.label} cannot be in the future`;
      else record[key] = iso;
    } else if (field.type === 'url') {
      if (!/^https?:\/\/\S+\.\S+/i.test(raw)) errors[key] = 'Source link must start with http:// or https://';
      else record[key] = raw;
    } else if (field.options) {
      const option = matchOption(raw, field.options);
      if (!option) errors[key] = `${field.label} must be one of: ${field.options.join(', ')}`;
      else record[key] = option;
    } else {
      record[key] = raw;
    }
  }

  if (record.latitude !== undefined && record.longitude !== undefined) {
    const inNigeria = record.latitude >= 3.5 && record.latitude <= 14.5 && record.longitude >= 2 && record.longitude <= 15.5;
    if (!inNigeria) errors.latitude = 'Coordinates must be inside Nigeria (latitude 3.5–14.5, longitude 2–15.5)';
  }

  if (record.state && operatingStates?.length) {
    const match = operatingStates.find(s => canonicalState(s) === canonicalState(record.state));
    if (match) record.state = match;
    else errors.state = `${record.state} is not an operating state (${operatingStates.join(', ')})`;
  }

  if (record.source_date && record.date && record.source_date < record.date) {
    errors.source_date = 'Source date cannot be before the incident date';
  }

  // Event ID: keep a supplied one if valid and unused, otherwise generate the next in sequence
  const suppliedId = clean(values.event_id);
  if (suppliedId) {
    if (!EVENT_ID_PATTERN.test(suppliedId)) errors.event_id = 'Event ID must look like EVT20260130001 (or leave it blank)';
    else if (takenIds.has(suppliedId)) errors.event_id = `Event ID ${suppliedId} already exists`;
  }

  if (Object.keys(errors).length) return { record: null, errors };

  if (suppliedId) {
    record.event_id = suppliedId;
    takenIds.add(suppliedId);
  } else {
    record.event_id = nextEventId(record.date, takenIds);
  }

  const reportedDate = normalizeDate(values.reported_date);
  record.reported_date = validDate(reportedDate) && reportedDate <= today ? reportedDate : today;

  if (columns) {
    for (const key of Object.keys(record)) if (!columns.includes(key)) delete record[key];
  }

  return { record: Object.fromEntries(SCHEMA_COLUMNS.filter(k => k in record).map(k => [k, record[k]])), errors };
}

// ---------------------------------------------------------------------------
// CSV template and upload
// ---------------------------------------------------------------------------

export const TEMPLATE_EXAMPLE_ID = 'EXAMPLE - delete this row';

const TEMPLATE_EXAMPLE = {
  event_id: TEMPLATE_EXAMPLE_ID,
  date: '2026-10-28',
  state: 'Niger',
  lga: 'Chanchaga',
  location: 'Kure Market, Minna',
  latitude: '9.5920',
  longitude: '6.5241',
  event_type: 'Armed Robbery',
  severity: 'High',
  description: 'Armed men robbed traders at Kure Market in the early evening. Two traders were injured.',
  fatalities: '0',
  injured: '2',
  abducted: '0',
  actors: 'Armed robbers',
  source: 'OAF field staff',
  source_url: '',
  source_date: '2026-10-28',
  reported_date: '',
  confidence: 'Medium',
  verification_status: 'Unverified'
};

function csvCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map(c => csvCell(row[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** CSV template with the security_events columns and one example row. */
export function buildTemplateCsv() {
  return toCsv([TEMPLATE_EXAMPLE], SCHEMA_COLUMNS);
}

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF, UTF-8 BOM). */
export function parseCsv(text) {
  const input = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

/**
 * Turns an uploaded CSV into incident value objects keyed by column.
 *
 * @returns {{ rows: Array<{ line: number, values: Object }>, missingColumns: string[], unknownColumns: string[] }}
 */
export function readIncidentCsv(text) {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], missingColumns: SCHEMA_COLUMNS, unknownColumns: [] };

  const headers = table[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const required = Object.entries(INCIDENT_FIELDS)
    .filter(([key, f]) => f.required && key !== 'latitude' && key !== 'longitude')
    .map(([key]) => key);
  const missingColumns = required.filter(c => !headers.includes(c));
  const unknownColumns = headers.filter(h => h && !SCHEMA_COLUMNS.includes(h) && h !== 'created_at');

  const rows = [];
  table.slice(1).forEach((cells, i) => {
    const values = {};
    headers.forEach((h, j) => { if (SCHEMA_COLUMNS.includes(h)) values[h] = cells[j] ?? ''; });
    if (String(values.event_id || '').startsWith('EXAMPLE')) return; // template example row
    rows.push({ line: i + 2, values });
  });
  return { rows, missingColumns, unknownColumns };
}

// ---------------------------------------------------------------------------
// Download (export)
// ---------------------------------------------------------------------------

/** Export columns: the table structure, plus the database's created_at. */
export const EXPORT_COLUMNS = [...SCHEMA_COLUMNS, 'created_at'];

/**
 * Incidents for a download, by incident date (inclusive range, YYYY-MM-DD), optional
 * state, and verification. Newest first.
 */
export function selectIncidentsForExport(incidents, { from = '', to = '', state = 'All', verifiedOnly = false } = {}) {
  return incidents
    .filter(e => {
      const day = normalizeDate(e.date);
      if ((from || to) && !day) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (state !== 'All' && canonicalState(e.state) !== canonicalState(state)) return false;
      if (verifiedOnly && String(e.verification_status || '').toLowerCase() !== 'verified') return false;
      return true;
    })
    .sort((a, b) => String(normalizeDate(b.date) || '').localeCompare(String(normalizeDate(a.date) || '')));
}

/** CSV of incidents in the security_events column order (same layout as the upload template). */
export function buildIncidentsCsv(incidents) {
  return toCsv(incidents, EXPORT_COLUMNS);
}
