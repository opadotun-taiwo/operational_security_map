import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EXTRACTION_SCHEMA,
  cleanCandidate,
  normalizeUrl,
  isSameIncident,
  removeDuplicates,
  nigeriaDates,
  geocodeQueries
} from '../pipeline.js';

// --- SDK stand-ins so provider requests can be inspected -------------------
const openaiCreate = vi.fn();
const anthropicCreate = vi.fn();
const anthropicBetaCreate = vi.fn();
vi.mock('openai', () => ({
  default: class { constructor() { this.responses = { create: openaiCreate }; } }
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {
      this.messages = { create: anthropicCreate };
      this.beta = { messages: { create: anthropicBetaCreate } };
    }
  }
}));

const { createProvider } = await import('../providers.js');
const { run } = await import('../index.js');

const NOW = new Date('2026-11-27T11:00:00Z').getTime(); // 12:00 in Nigeria

const candidate = (over = {}) => ({
  date: '2026-11-26', state: 'Kaduna State', lga: 'Kauru', location: 'Kizachi', event_type: 'Kidnapping',
  severity: 'High', description: 'Gunmen abducted 12 villagers in Kizachi, Kauru LGA.', fatalities: null,
  injured: null, abducted: 12, actors: 'Bandits', source: 'Daily Trust',
  source_url: 'https://dailytrust.com/gunmen-abduct-12/?utm_source=x', source_date: '2026-11-26',
  confidence: 'Medium', verification_status: 'Unverified', ...over
});

// ---------------------------------------------------------------------------

describe('extraction schema', () => {
  it('is strict: every property required, no extra properties (both providers need this)', () => {
    const item = EXTRACTION_SCHEMA.properties.events.items;
    expect(EXTRACTION_SCHEMA.additionalProperties).toBe(false);
    expect(item.additionalProperties).toBe(false);
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
    expect(item.properties).not.toHaveProperty('latitude');
    expect(item.properties).not.toHaveProperty('event_id');
    expect(item.properties.event_type.enum).toContain('Farmer-Herder Conflict');
    expect(item.properties).not.toHaveProperty('verification_status'); // set by the risk team, not the AI
  });
});

describe('cleanCandidate', () => {
  it('normalizes to the security_events format', () => {
    const { incident } = cleanCandidate(candidate({ actors: 'null', severity: 'high' }), { now: NOW });
    expect(incident).toMatchObject({ state: 'Kaduna', severity: 'High', actors: 'Unknown', abducted: 12, fatalities: null });
  });

  it('rejects records without a usable date, state or description', () => {
    expect(cleanCandidate(candidate({ date: null, source_date: null }), { now: NOW }).reason).toBe('no valid incident date');
    expect(cleanCandidate(candidate({ date: '2019-01-01', source_date: null }), { now: NOW }).reason).toBe('no valid incident date');
    expect(cleanCandidate(candidate({ state: ' ' }), { now: NOW }).reason).toBe('no state');
    expect(cleanCandidate(candidate({ description: '' }), { now: NOW }).reason).toBe('no description');
  });

  it('always saves collected incidents as Unverified, whatever the AI says', () => {
    expect(cleanCandidate(candidate({ verification_status: 'Verified' }), { now: NOW }).incident.verification_status).toBe('Unverified');
  });

  it('falls back to safe defaults for invalid values', () => {
    const { incident } = cleanCandidate(candidate({ event_type: 'Spaceship', confidence: 'certain', abducted: 'scores', source_url: 'not a link' }), { now: NOW });
    expect(incident).toMatchObject({ event_type: 'Other', confidence: 'Low', abducted: null, source_url: null });
  });
});

describe('duplicates', () => {
  it('matches the same article despite tracking parameters', () => {
    expect(normalizeUrl('https://www.dailytrust.com/gunmen-abduct-12/?utm_source=x')).toBe(normalizeUrl('http://dailytrust.com/gunmen-abduct-12'));
  });

  it('matches the same event within a day in the same LGA, not a different LGA or type', () => {
    const a = { date: '2026-11-26', state: 'Kaduna', lga: 'Kauru LGA', event_type: 'Kidnapping' };
    expect(isSameIncident(a, { date: '2026-11-27', state: 'kaduna state', lga: 'Kauru', event_type: 'Kidnapping' })).toBe(true);
    expect(isSameIncident(a, { date: '2026-11-26', state: 'Kaduna', lga: 'Zaria', event_type: 'Kidnapping' })).toBe(false);
    expect(isSameIncident(a, { date: '2026-11-26', state: 'Kaduna', lga: 'Kauru', event_type: 'Banditry' })).toBe(false);
    expect(isSameIncident(a, { date: '2026-11-23', state: 'Kaduna', lga: 'Kauru', event_type: 'Kidnapping' })).toBe(false);
  });

  it('removes duplicates of existing rows and within the batch', () => {
    const existing = [{ event_id: 'EVT20261126001', date: '2026-11-26', state: 'Niger', lga: 'Shiroro', event_type: 'Banditry' }];
    const batch = [
      { date: '2026-11-26', state: 'Niger', lga: 'Shiroro', event_type: 'Banditry' },
      { date: '2026-11-26', state: 'Kano', lga: 'Gwale', event_type: 'Riot' },
      { date: '2026-11-26', state: 'Kano', lga: 'Gwale', event_type: 'Riot' }
    ];
    const { fresh, duplicates } = removeDuplicates(batch, existing);
    expect(fresh).toHaveLength(1);
    expect(duplicates.map(d => d.of.event_id || 'batch')).toEqual(['EVT20261126001', 'batch']);
  });
});

describe('dates and geocoding queries', () => {
  it('uses Nigeria time for the collection window', () => {
    expect(nigeriaDates(new Date('2026-11-26T23:30:00Z').getTime())).toEqual({ today: '2026-11-27', yesterday: '2026-11-26' });
  });

  it('tries community, then LGA, then state', () => {
    expect(geocodeQueries({ location: 'Kizachi', lga: 'Kauru', state: 'Kaduna' }).map(q => q.level)).toEqual(['community', 'lga', 'state']);
    expect(geocodeQueries({ location: null, lga: null, state: 'Kaduna' }).map(q => q.query)).toEqual(['Kaduna State, Nigeria']);
  });
});

// ---------------------------------------------------------------------------

/** Minimal stand-in for the Supabase query builder used by the job. */
function fakeSupabase(rows) {
  const inserted = [];
  const from = () => {
    const q = { filters: [] };
    const builder = {
      select() { return builder; },
      gte(col, v) { q.filters.push(r => String(r[col] || '') >= v); return builder; },
      in(col, vs) { q.filters.push(r => vs.includes(r[col])); return builder; },
      like(col, pattern) { const p = pattern.replace('%', ''); q.filters.push(r => String(r[col] || '').startsWith(p)); return builder; },
      insert(payload) { inserted.push(...payload); return Promise.resolve({ error: null }); },
      then(resolve) { resolve({ data: rows.filter(r => q.filters.every(f => f(r))), error: null }); }
    };
    return builder;
  };
  return { client: { from }, inserted };
}

const geocodeResponse = (lat, lng, lga, state, country = 'Nigeria') => ({
  status: 'OK',
  results: [{
    geometry: { location: { lat, lng }, location_type: 'APPROXIMATE' },
    address_components: [
      { long_name: lga, types: ['administrative_area_level_2'] },
      { long_name: state, types: ['administrative_area_level_1'] },
      { long_name: country, types: ['country'] }
    ]
  }]
});

describe('run (end to end with fakes)', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(async (url) => {
      const q = decodeURIComponent(new URL(url).searchParams.get('address'));
      let body = { status: 'ZERO_RESULTS', results: [] };
      if (q.startsWith('Kizachi')) body = geocodeResponse(10.1, 8.2, 'Kauru', 'Kaduna');
      if (q.startsWith('Sabon Gari, Benin')) body = geocodeResponse(6.33, 5.6, 'Oredo', 'Edo'); // wrong state: must be skipped
      if (q.startsWith('Gwoza')) body = geocodeResponse(11.08, 13.69, 'Gwoza', 'Borno');
      if (q.startsWith('Plateau State')) body = geocodeResponse(9.21, 9.51, '', 'Plateau');
      return { ok: true, json: async () => body };
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ai = (events) => ({
    name: 'Fake AI',
    research: vi.fn(async () => 'notes'),
    extract: vi.fn(async () => ({ events }))
  });

  it('cleans, places, de-duplicates, numbers and saves new incidents', async () => {
    const existing = [
      { event_id: 'EVT20261126001', date: '2026-11-26', state: 'Borno', lga: 'Bama', event_type: 'Insurgency', source_url: 'https://humangle.ng/old' },
      { event_id: 'EVT20261126002', date: '2026-11-20', state: 'Kano', lga: 'Gwale', event_type: 'Riot', source_url: null }
    ];
    const db = fakeSupabase(existing);
    const events = [
      candidate(),                                                                      // new, placed at community level
      candidate({ state: 'Borno', lga: 'Gwoza', location: null, event_type: 'Insurgency', source_url: 'https://humangle.ng/old' }), // same link as existing
      candidate({ state: 'Plateau', lga: null, location: 'Sabon Gari, Benin', event_type: 'Communal Violence', source_url: null }), // wrong-state match -> state level
      candidate({ state: 'Lagos', lga: 'Nowhere', location: null, event_type: 'Riot', source_url: null }), // no geocode at all
      candidate({ description: '' })                                                    // rejected
    ];

    const result = await run({ ai: ai(events), supabase: db.client, mapsKey: 'k', now: NOW, quiet: true });

    expect(result.found).toBe(5);
    expect(result.rejected).toHaveLength(1);
    expect(result.duplicates.map(d => d.of)).toEqual(['EVT20261126001']);
    expect(result.unplaced.map(u => u.state)).toEqual(['Lagos']);

    expect(db.inserted).toHaveLength(2);
    const [kaduna, plateau] = db.inserted;
    expect(kaduna).toMatchObject({ event_id: 'EVT20261126003', state: 'Kaduna', lga: 'Kauru', latitude: 10.1, longitude: 8.2, reported_date: '2026-11-27' });
    expect(plateau).toMatchObject({ event_id: 'EVT20261126004', state: 'Plateau', latitude: 9.21, longitude: 9.51 });
    expect(kaduna).not.toHaveProperty('_placed');
    expect(result.added.map(a => a.placed)).toEqual(['community', 'state']);
    // Google is only ever asked about Nigeria
    expect(fetchMock.mock.calls.every(([url]) => url.includes('components=country:NG'))).toBe(true);
  });

  it('dry run saves nothing but reports what it would add', async () => {
    const db = fakeSupabase([]);
    const result = await run({ ai: ai([candidate()]), supabase: db.client, mapsKey: 'k', now: NOW, dryRun: true, quiet: true });
    expect(db.inserted).toHaveLength(0);
    expect(result.added).toHaveLength(1);
    expect(result.summary).toMatch(/dry run: nothing saved/);
    expect(result.summary).toMatch(/Would add/);
  });

  it('collects a specific day when asked', async () => {
    const fake = ai([]);
    const result = await run({ ai: fake, supabase: fakeSupabase([]).client, mapsKey: 'k', now: NOW, targetDate: '2026-11-01', quiet: true });
    expect(result.window).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    expect(fake.research.mock.calls[0][0]).toMatch(/reported between 2026-11-01 and 2026-11-01/);
  });
});

// ---------------------------------------------------------------------------

describe('providers (switch with AI_PROVIDER, no code change)', () => {
  beforeEach(() => { openaiCreate.mockReset(); anthropicCreate.mockReset(); anthropicBetaCreate.mockReset(); });

  it('OpenAI: web search for research, strict JSON schema for extraction', async () => {
    openaiCreate
      .mockResolvedValueOnce({ output_text: 'notes' })
      .mockResolvedValueOnce({ status: 'completed', output_text: '{"events":[]}' });
    const ai = createProvider({ provider: 'openai', model: 'gpt-6-luna', reasoning: 'low' });

    expect(await ai.research('find')).toBe('notes');
    expect(await ai.extract('convert')).toEqual({ events: [] });

    const [researchReq, extractReq] = openaiCreate.mock.calls.map(c => c[0]);
    expect(researchReq).toMatchObject({ model: 'gpt-6-luna', reasoning: { effort: 'low' }, input: 'find' });
    expect(researchReq.tools[0]).toMatchObject({ type: 'web_search', user_location: { type: 'approximate', country: 'NG' } });
    expect(extractReq.text.format).toMatchObject({ type: 'json_schema', strict: true, schema: EXTRACTION_SCHEMA });
    expect(extractReq).not.toHaveProperty('tools');
  });

  it('Claude: continues paused web searches and uses JSON output with refusal fallbacks', async () => {
    anthropicBetaCreate
      .mockResolvedValueOnce({ stop_reason: 'pause_turn', content: [{ type: 'server_tool_use' }] })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'notes' }] })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"events":[{"x":1}]}' }] });
    const ai = createProvider({ provider: 'anthropic', model: 'claude-opus-5-5', reasoning: 'low' });

    expect(await ai.research('find')).toBe('notes');
    expect(await ai.extract('convert')).toEqual({ events: [{ x: 1 }] });

    const [first, second, extractReq] = anthropicBetaCreate.mock.calls.map(c => c[0]);
    expect(first.tools[0]).toMatchObject({ type: 'web_search_20260209', name: 'web_search' });
    expect(first).toMatchObject({ fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], output_config: { effort: 'low' } });
    expect(second.messages).toHaveLength(2); // paused turn sent back, no extra user message
    expect(second.messages[1].role).toBe('assistant');
    expect(extractReq.output_config.format).toEqual({ type: 'json_schema', schema: EXTRACTION_SCHEMA });
    expect(extractReq).not.toHaveProperty('tools');
  });

  it('Claude models without server fallbacks use the standard endpoint', async () => {
    anthropicCreate.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'notes' }] });
    const ai = createProvider({ provider: 'anthropic', model: 'claude-haiku-5-5', reasoning: 'none' });
    await ai.research('find');
    expect(anthropicCreate.mock.calls[0][0]).not.toHaveProperty('fallbacks');
    expect(anthropicCreate.mock.calls[0][0].output_config).toEqual({ effort: 'low' });
  });

  it('reports a clear error for an unknown provider or missing model', () => {
    expect(() => createProvider({ provider: 'gemini', model: 'x' })).toThrow(/Unknown AI_PROVIDER/);
    expect(() => createProvider({ provider: 'openai', model: '' })).toThrow(/AI_MODEL is not set/);
  });
});
