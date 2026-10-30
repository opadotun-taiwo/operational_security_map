import { supabase } from '../supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * SHA-256 fingerprints of the (lower-cased) emails allowed to submit incident reports.
 * Only hashes are shipped so the addresses never appear in the page or its source.
 * Keep in sync with supabase/functions/submit-incident/index.ts.
 */
const AUTHORIZED_REPORTER_HASHES = new Set([
  '5d1b28362c367fdcbd3e1faa22755e4f3e2349bb99b7538098d5fb3c191b6db5',
  '9da5ec8f4beea3533f6f573d7f6f3d18e2e75f80ac76ce0a9c3e53745f16e4e6',
  '3ee8cdd58fccc2a491ee4fa65b9c1d9d3ad1dc4e315106382124acda1184da67'
]);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** True when the email belongs to an approved incident reporter. */
export async function isAuthorizedReporter(email) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) return false;
  return AUTHORIZED_REPORTER_HASHES.has(await sha256Hex(normalized));
}

/** Fields the dashboard reads from `security_events`, in form order. */
export const INCIDENT_FIELDS = [
  { key: 'date', label: 'Date of incident', type: 'date', required: true },
  { key: 'event_type', label: 'Event type', type: 'text', required: true, list: 'eventTypes', placeholder: 'e.g. Kidnapping' },
  { key: 'severity', label: 'Severity', type: 'select', required: true, options: ['Critical', 'High', 'Medium', 'Low'] },
  { key: 'verification_status', label: 'Verification', type: 'select', options: ['Unverified', 'Verified'], defaultValue: 'Unverified' },
  { key: 'state', label: 'State', type: 'text', required: true, list: 'states', placeholder: 'e.g. Niger' },
  { key: 'lga', label: 'LGA', type: 'text', placeholder: 'Local government area' },
  { key: 'location', label: 'Location', type: 'text', placeholder: 'Town, village or road' },
  { key: 'latitude', label: 'Latitude', type: 'number', required: true, step: 'any' },
  { key: 'longitude', label: 'Longitude', type: 'number', required: true, step: 'any' },
  { key: 'description', label: 'What happened?', type: 'textarea', required: true, placeholder: 'Describe the incident, who was affected and the source of the information.' },
  { key: 'fatalities', label: 'Fatalities', type: 'integer', defaultValue: '0' },
  { key: 'injured', label: 'Injured', type: 'integer', defaultValue: '0' },
  { key: 'abducted', label: 'Abducted', type: 'integer', defaultValue: '0' },
  { key: 'actors', label: 'Actors involved', type: 'text', placeholder: 'e.g. Armed bandits' },
  { key: 'source_url', label: 'Source link', type: 'url', placeholder: 'https://' }
];

/** Columns filled by the database or by this module, never typed by the reporter. */
const SYSTEM_COLUMNS = new Set(['id', 'event_id', 'created_at', 'updated_at', 'inserted_at']);
const REPORTER_COLUMNS = ['reported_by', 'reporter_email', 'reporter', 'submitted_by', 'created_by'];
const KNOWN_KEYS = new Set(INCIDENT_FIELDS.map(f => f.key));

/**
 * Reads one existing incident to learn the table's real columns, so the form only
 * offers (and submits) fields that `security_events` actually has.
 *
 * @returns {Promise<{ columns: string[] | null, sample: Object | null }>} columns is null when unknown (empty table or error)
 */
export async function fetchIncidentTableShape() {
  const { data, error } = await supabase.from('security_events').select('*').limit(1);
  if (error || !data?.length) return { columns: null, sample: null };
  return { columns: Object.keys(data[0]), sample: data[0] };
}

/**
 * Splits the table's columns into the known form fields and any extra columns.
 */
export function describeFormFields(columns) {
  if (!columns) return { fields: INCIDENT_FIELDS, extraColumns: [] };
  const present = new Set(columns);
  const fields = INCIDENT_FIELDS.filter(f => present.has(f.key) || f.key === 'latitude' || f.key === 'longitude');
  const extraColumns = columns.filter(c => !KNOWN_KEYS.has(c) && !SYSTEM_COLUMNS.has(c) && !REPORTER_COLUMNS.includes(c));
  return { fields, extraColumns };
}

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Validates form values and builds the row to insert.
 *
 * @param {Object} values - Raw form values keyed by column
 * @param {Object} options
 * @param {string[] | null} options.columns - Known table columns (null = unknown)
 * @param {Object | null} options.sample - An existing row, used to match value types
 * @param {string} options.reporterEmail
 * @param {number} [options.now]
 * @returns {{ record: Object | null, errors: Object<string, string> }}
 */
export function buildIncidentRecord(values, { columns = null, sample = null, reporterEmail = '', now = Date.now() } = {}) {
  const errors = {};
  const { fields, extraColumns } = describeFormFields(columns);
  const record = {};

  for (const field of fields) {
    const raw = emptyToNull(values[field.key]);
    if (field.required && raw === null) {
      errors[field.key] = `${field.label} is required`;
      continue;
    }
    if (raw === null) continue;

    if (field.type === 'number' || field.type === 'integer') {
      const num = Number(raw);
      if (!Number.isFinite(num) || (field.type === 'integer' && (!Number.isInteger(num) || num < 0))) {
        errors[field.key] = field.type === 'integer' ? `${field.label} must be a whole number` : `${field.label} must be a number`;
        continue;
      }
      record[field.key] = num;
    } else if (field.type === 'url') {
      if (!/^https?:\/\/\S+\.\S+/i.test(raw)) {
        errors[field.key] = 'Enter a full link starting with http:// or https://';
        continue;
      }
      record[field.key] = raw;
    } else {
      record[field.key] = raw;
    }
  }

  if (!errors.latitude && !errors.longitude && record.latitude !== undefined && record.longitude !== undefined) {
    const inNigeria = record.latitude >= 3.5 && record.latitude <= 14.5 && record.longitude >= 2 && record.longitude <= 15.5;
    if (!inNigeria) errors.latitude = 'Location must be inside Nigeria (latitude 3.5–14.5, longitude 2–15.5)';
  }

  if (record.date && new Date(record.date).getTime() > now + 24 * 60 * 60 * 1000) {
    errors.date = 'Date cannot be in the future';
  }

  for (const column of extraColumns) {
    const raw = emptyToNull(values[column]);
    if (raw === null) continue;
    const sampleValue = sample?.[column];
    if (typeof sampleValue === 'number') {
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        errors[column] = `${column} must be a number`;
        continue;
      }
      record[column] = num;
    } else if (typeof sampleValue === 'boolean') {
      record[column] = raw === 'true';
    } else {
      record[column] = raw;
    }
  }

  // Text incident IDs are not generated by the database; numeric ones usually are
  if (columns?.includes('event_id') && typeof sample?.event_id === 'string') {
    record.event_id = `OAF-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  const reporterColumn = columns?.find(c => REPORTER_COLUMNS.includes(c));
  if (reporterColumn && reporterEmail) record[reporterColumn] = normalizeEmail(reporterEmail);

  return { record: Object.keys(errors).length ? null : record, errors };
}

/**
 * Saves a report. Uses the `submit-incident` Edge Function when it is deployed (it
 * re-checks the email server-side); otherwise inserts directly, which only works if
 * the table's row-level security allows it.
 *
 * @returns {Promise<Object>} The inserted row
 */
export async function submitIncidentReport(record, reporterEmail) {
  if (!(await isAuthorizedReporter(reporterEmail))) {
    throw new Error('This email is not authorised to submit incident reports.');
  }

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    let response = null;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/submit-incident`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email: normalizeEmail(reporterEmail), record })
      });
    } catch {
      response = null; // Function unreachable: fall back to a direct insert
    }

    if (response && response.status !== 404) {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Report could not be saved (error ${response.status}).`);
      return body.incident;
    }
  }

  const { data, error } = await supabase.from('security_events').insert(record).select().single();
  if (error) {
    if (error.code === '42501' || /row-level security|permission/i.test(error.message)) {
      throw new Error('The database refused the report. An administrator needs to deploy the submit-incident function or allow inserts on security_events (see README).');
    }
    throw new Error(`Report could not be saved: ${error.message}`);
  }
  return data;
}
