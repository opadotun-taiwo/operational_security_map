// Daily incident collection: finds Nigerian security incidents published in the last
// day, converts them to the security_events structure, places them with Google
// Geocoding, skips duplicates and saves the new ones to Supabase.
//
// Run by .github/workflows/daily-incident-collection.yml. Locally:
//   DRY_RUN=true node scripts/ingest/index.js
// Environment: AI_PROVIDER, AI_MODEL, AI_REASONING, OPENAI_API_KEY or ANTHROPIC_API_KEY,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_SERVER_KEY, DRY_RUN, TARGET_DATE.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { nextEventId } from '../../src/utils/incidentSchema.js';
import { parseAddressComponents } from '../../src/services/geocoding.js';
import { canonicalState } from '../../src/utils/operatingStates.js';
import { createProvider } from './providers.js';
import { cleanCandidate, removeDuplicates, nigeriaDates, geocodeQueries } from './pipeline.js';

const env = (name, fallback = '') => (process.env[name] ?? '').trim() || fallback;
const DRY_RUN = env('DRY_RUN', 'false').toLowerCase() === 'true';
const RESULTS_FILE = 'ingest-results.json';

function requireEnv(names) {
  const missing = names.filter(n => !env(n));
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')} (add them as GitHub Actions secrets/variables)`);
}

// ---------------------------------------------------------------------------
// Prompts (rules carried over from the n8n "GR automated news" workflow)
// ---------------------------------------------------------------------------

function researchPrompt(fromDate, toDate) {
  return `You are a Nigeria security intelligence researcher for One Acre Fund's risk team.

Search the web for security incidents in Nigeria that were reported between ${fromDate} and ${toDate}.
Cover all 36 states and the FCT, with extra attention to the North West, North Central and North East.

Incident types: kidnapping, banditry, terrorist attacks, insurgency, armed attacks, armed robbery,
communal or farmer-herder violence, cult violence, civil unrest and riots, road attacks, explosions,
militancy, and significant security operations.

Prefer sources in this order:
1. Official: Nigeria Police, Army, Defence HQ, DSS, state governments.
2. Established security reporting, e.g. Zagazola Makama, HumAngle, conflict monitors.
3. Major Nigerian outlets: Punch, Premium Times, Channels TV, Daily Trust, Vanguard, TheCable, Guardian Nigeria.
4. Local outlets and social media only when corroborated.

For EACH distinct incident, write a short entry with:
- incident date, community/town, LGA and state
- what happened, and the numbers killed, injured and abducted exactly as reported (say "not stated" if not given)
- who was responsible, if reported
- the outlet name, the article URL and its publication date
- whether an official source or more than one independent outlet confirms it

List each real-world incident once even if several outlets covered it (give the best URL and mention the others).
Only include incidents in Nigeria that happened or were first reported in that window. Do not invent details.
Aim for completeness: up to 40 incidents.`;
}

function extractionPrompt(notes, today) {
  return `Convert these research notes into structured security incident records.
Today's date is ${today}.

Rules:
- One record per distinct incident; merge entries that describe the same event.
- Skip anything that is not a security incident in Nigeria, or has no state.
- date: when the incident happened (YYYY-MM-DD); if unknown use the publication date.
- state: the Nigerian state name without the word "State" (use "FCT" for Abuja).
- lga and location: as reported; null if not stated. Never guess an LGA.
- event_type: choose the closest allowed value; "Other" if none fits.
- severity: Critical (mass casualties or 10+ killed/abducted), High (deaths, abductions or major attack),
  Medium (injuries, property damage, credible threat), Low (minor or contained).
- fatalities / injured / abducted: explicit numbers only. 0 if the report says none, null if unknown.
  Never turn words like "scores" or "many" into numbers.
- actors: e.g. "Bandits", "ISWAP", "Unknown gunmen"; "Unknown" if not stated.
- description: 1-2 factual sentences: what happened, where, and the impact.
- source / source_url / source_date: the best original report.
- confidence: High (official or several reliable outlets), Medium (one reliable outlet), Low (unclear or social media).
  (Verification is done later by the risk team, not here.)

Research notes:
"""
${notes}
"""`;
}

// ---------------------------------------------------------------------------
// Google Geocoding (server key)
// ---------------------------------------------------------------------------

async function geocode(query, key) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:NG&key=${key}`;
  const res = await globalThis.fetch(url);
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'ZERO_RESULTS') return null;
  if (data.status !== 'OK') throw new Error(`Geocoding ${data.status}${data.error_message ? `: ${data.error_message}` : ''}`);
  const top = data.results[0];
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    ...parseAddressComponents(top.address_components)
  };
}

/** Most precise point whose state matches the incident's state (never trusts AI coordinates). */
async function placeIncident(incident, key) {
  for (const { level, query } of geocodeQueries(incident)) {
    const hit = await geocode(query, key);
    if (!hit) continue;
    if (hit.country && hit.country !== 'Nigeria') continue;
    if (hit.state && canonicalState(hit.state) !== canonicalState(incident.state)) continue;
    return { ...hit, level };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function loadExisting(supabase, sinceDate, urls) {
  const columns = 'event_id,date,state,lga,location,event_type,source_url';
  const recent = await supabase.from('security_events').select(columns).gte('date', sinceDate);
  if (recent.error) throw new Error(`Reading recent incidents failed: ${recent.error.message}`);
  let byUrl = [];
  if (urls.length) {
    const res = await supabase.from('security_events').select(columns).in('source_url', urls);
    if (res.error) throw new Error(`Reading incidents by link failed: ${res.error.message}`);
    byUrl = res.data;
  }
  return [...recent.data, ...byUrl];
}

async function takenIdsFor(supabase, dates) {
  const taken = new Set();
  for (const date of dates) {
    const prefix = `EVT${date.replace(/-/g, '')}`;
    const res = await supabase.from('security_events').select('event_id').like('event_id', `${prefix}%`);
    if (res.error) throw new Error(`Reading event IDs failed: ${res.error.message}`);
    res.data.forEach(r => taken.add(r.event_id));
  }
  return taken;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function writeSummary(result, { quiet = false } = {}) {
  const lines = [
    `## Daily incident collection ${result.dryRun ? '(dry run: nothing saved)' : ''}`,
    '',
    `Window: **${result.window.from} to ${result.window.to}** · Model: ${result.model}`,
    '',
    '| Found | Added | Duplicates | Could not place | Rejected |',
    '|---|---|---|---|---|',
    `| ${result.found} | ${result.added.length} | ${result.duplicates.length} | ${result.unplaced.length} | ${result.rejected.length} |`,
    ''
  ];
  if (result.added.length) {
    lines.push(`### ${result.dryRun ? 'Would add' : 'Added'}`, '', '| Event ID | Date | State | LGA | Type | Severity | Placed at | Source |', '|---|---|---|---|---|---|---|---|');
    for (const r of result.added) {
      lines.push(`| ${r.event_id} | ${r.date} | ${r.state} | ${r.lga || ''} | ${r.event_type} | ${r.severity} | ${r.placed} | ${r.source_url ? `[${r.source || 'link'}](${r.source_url})` : (r.source || '')} |`);
    }
    lines.push('');
  }
  if (result.duplicates.length) {
    lines.push('### Skipped as duplicates', '');
    result.duplicates.forEach(d => lines.push(`- ${d.date} ${d.state} ${d.lga || ''} ${d.event_type}: same as ${d.of}`));
    lines.push('');
  }
  if (result.unplaced.length || result.rejected.length) {
    lines.push('### Not saved', '');
    result.unplaced.forEach(u => lines.push(`- ${u.date} ${u.state} ${u.lga || ''} ${u.event_type}: location could not be found`));
    result.rejected.forEach(r => lines.push(`- ${r.reason}: ${r.description || ''}`));
  }
  const markdown = lines.join('\n');
  if (quiet) return markdown;
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(result, null, 2));
  return markdown;
}

/**
 * One collection run. Dependencies are passed in so the run can be tested end to end.
 *
 * @returns {Promise<Object>} The run result (also written as the job summary)
 */
export async function run({ ai, supabase, mapsKey, now = Date.now(), dryRun = false, targetDate = '', quiet = false }) {
  const { today, yesterday } = nigeriaDates(now);
  const toDate = targetDate || today;
  const fromDate = targetDate ? toDate : yesterday;

  if (!quiet) console.log(`Searching for incidents reported ${fromDate} to ${toDate} with ${ai.name}…`);
  const notes = await ai.research(researchPrompt(fromDate, toDate));
  const extracted = await ai.extract(extractionPrompt(notes, today));
  const candidates = Array.isArray(extracted?.events) ? extracted.events : [];
  if (!quiet) console.log(`AI returned ${candidates.length} candidate incident(s).`);

  // 1. Clean and validate each candidate
  const cleaned = [];
  const rejected = [];
  for (const raw of candidates) {
    const { incident, reason } = cleanCandidate(raw, { now });
    if (incident) cleaned.push(incident);
    else rejected.push({ reason, description: String(raw.description || '').slice(0, 140) });
  }

  // 2. Skip duplicates of the last 30 days, of older rows with the same link, and of each other
  const since = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
  const urls = [...new Set(cleaned.map(c => c.source_url).filter(Boolean))];
  const existing = await loadExisting(supabase, since, urls);
  const { fresh, duplicates } = removeDuplicates(cleaned, existing);

  // 3. Coordinates from Google, most precise level whose state matches
  const placed = [];
  const unplaced = [];
  for (const incident of fresh) {
    try {
      const hit = await placeIncident(incident, mapsKey);
      if (!hit) { unplaced.push(incident); continue; }
      placed.push({
        ...incident,
        lga: incident.lga || hit.lga || null,
        latitude: Number(hit.lat.toFixed(6)),
        longitude: Number(hit.lng.toFixed(6)),
        _placed: hit.level
      });
    } catch (err) {
      console.warn(`Geocoding failed for ${incident.state} ${incident.lga || ''}: ${err.message}`);
      unplaced.push(incident);
    }
  }

  // 4. Event IDs (EVT<date><seq>) that never collide with existing rows
  const taken = await takenIdsFor(supabase, [...new Set(placed.map(p => p.date))]);
  const rows = placed.map(({ _placed, ...p }) => ({
    event_id: nextEventId(p.date, taken),
    ...p,
    reported_date: today,
    _placed
  }));

  // 5. Save
  if (!dryRun && rows.length) {
    const payload = rows.map(({ _placed, ...r }) => r);
    const res = await supabase.from('security_events').insert(payload);
    if (res.error) throw new Error(`Saving incidents failed: ${res.error.message}`);
  }

  const result = {
    dryRun,
    model: ai.name,
    window: { from: fromDate, to: toDate },
    found: candidates.length,
    added: rows.map(({ _placed, ...r }) => ({ ...r, placed: _placed })),
    duplicates: duplicates.map(d => ({ ...d.incident, of: d.of.event_id || 'another item in this run' })),
    unplaced,
    rejected
  };
  result.summary = writeSummary(result, { quiet });
  return result;
}

async function main() {
  const provider = env('AI_PROVIDER', 'openai').toLowerCase();
  requireEnv(['AI_MODEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_MAPS_SERVER_KEY',
    provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY']);

  await run({
    ai: createProvider({ provider, model: env('AI_MODEL'), reasoning: env('AI_REASONING', 'low') }),
    supabase: createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } }),
    mapsKey: env('GOOGLE_MAPS_SERVER_KEY'),
    dryRun: DRY_RUN,
    targetDate: env('TARGET_DATE')
  });
}

// Run only when executed directly (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(`Incident collection failed: ${err.message}`);
    process.exit(1);
  });
}
