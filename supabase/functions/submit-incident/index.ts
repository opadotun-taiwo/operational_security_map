// Supabase Edge Function: submit-incident
// Inserts an incident report into security_events after checking, server-side, that the
// reporter's email is on the approved list. Uses the service role key, so security_events
// can stay closed to direct inserts from the browser.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// SHA-256 of the lower-cased approved emails (keep in sync with src/services/incidentReports.js)
const AUTHORIZED_REPORTER_HASHES = new Set([
  '5d1b28362c367fdcbd3e1faa22755e4f3e2349bb99b7538098d5fb3c191b6db5',
  '9da5ec8f4beea3533f6f573d7f6f3d18e2e75f80ac76ce0a9c3e53745f16e4e6',
  '3ee8cdd58fccc2a491ee4fa65b9c1d9d3ad1dc4e315106382124acda1184da67'
]);

// Columns a report may never set itself
const BLOCKED_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'inserted_at']);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const { email, record, records } = await req.json();
    const normalized = String(email || '').trim().toLowerCase();

    if (!AUTHORIZED_REPORTER_HASHES.has(await sha256Hex(normalized))) {
      return json({ error: 'This email is not authorised to submit incident reports.' }, 403);
    }

    // Accepts one report (`record`, from the form) or many (`records`, from a CSV upload)
    const batch = Array.isArray(records) ? records : record ? [record] : [];
    if (batch.length === 0) return json({ error: 'Missing incident record.' }, 400);
    if (batch.length > 500) return json({ error: 'Upload at most 500 incidents at a time.' }, 400);

    for (const [i, r] of batch.entries()) {
      const label = batch.length > 1 ? `Row ${i + 1}: ` : '';
      if (!r || typeof r !== 'object' || Array.isArray(r)) return json({ error: `${label}invalid incident record.` }, 400);
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      if (!(lat >= 3.5 && lat <= 14.5 && lng >= 2 && lng <= 15.5)) {
        return json({ error: `${label}location must be inside Nigeria.` }, 400);
      }
      for (const required of ['event_id', 'date', 'state', 'lga', 'event_type', 'severity', 'description', 'source', 'confidence', 'verification_status']) {
        if (!r[required]) return json({ error: `${label}${required} is required.` }, 400);
      }
    }

    const rows = batch.map(r => Object.fromEntries(Object.entries(r).filter(([key]) => !BLOCKED_COLUMNS.has(key))));

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json({ error: 'Function is missing Supabase credentials.' }, 500);

    const insert = await fetch(`${supabaseUrl}/rest/v1/security_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(rows)
    });

    const data = await insert.json();
    if (!insert.ok) {
      console.error('Insert into security_events failed:', data);
      return json({ error: data?.message || 'Report could not be saved.' }, insert.status);
    }

    console.log(`${rows.length} incident report(s) submitted by ${normalized}`);
    const incidents = Array.isArray(data) ? data : [data];
    return json({ incidents, incident: incidents[0] });
  } catch (err) {
    console.error('Unexpected error in submit-incident:', err);
    return json({ error: (err as Error).message || 'Internal server error' }, 500);
  }
});
