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

// Schema, validation and CSV helpers live in a shared module (also used by the ingest job)
export * from '../utils/incidentSchema';

/** Reads the live table's column names from one row (null when unavailable). */
export async function fetchIncidentColumns() {
  const { data, error } = await supabase.from('security_events').select('*').limit(1);
  if (error || !data?.length) return null;
  return Object.keys(data[0]);
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/**
 * Saves one or more reports. Uses the `submit-incident` Edge Function when it is
 * deployed (it re-checks the email server-side); otherwise inserts directly, which
 * only works if the table's row-level security allows it.
 *
 * @param {Array<Object>} records
 * @returns {Promise<Array<Object>>} The inserted rows
 */
export async function submitIncidentReports(records, reporterEmail) {
  if (!(await isAuthorizedReporter(reporterEmail))) {
    throw new Error('This email is not authorised to submit incident reports.');
  }
  if (!records.length) return [];

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
        body: JSON.stringify({ email: normalizeEmail(reporterEmail), records })
      });
    } catch {
      response = null; // Function unreachable: fall back to a direct insert
    }

    if (response && response.status !== 404) {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Report could not be saved (error ${response.status}).`);
      return body.incidents || (body.incident ? [body.incident] : records);
    }
  }

  const { data, error } = await supabase.from('security_events').insert(records).select();
  if (error) {
    if (error.code === '42501' || /row-level security|permission/i.test(error.message)) {
      throw new Error('The database refused the report. An administrator needs to deploy the submit-incident function or allow inserts on security_events (see README).');
    }
    if (error.code === '23505') {
      throw new Error('An incident with the same Event ID already exists. Refresh the page and try again.');
    }
    throw new Error(`Report could not be saved: ${error.message}`);
  }
  return data || records;
}
