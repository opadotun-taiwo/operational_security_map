import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));

const {
  isAuthorizedReporter,
  buildIncidentRecord,
  nextEventId,
  normalizeDate,
  buildTemplateCsv,
  parseCsv,
  readIncidentCsv,
  SCHEMA_COLUMNS
} = await import('../services/incidentReports');

const NOW = new Date('2026-10-30T12:00:00Z').getTime();
const STATES = ['FCT', 'Gombe', 'Jigawa', 'Kaduna', 'Kano', 'Niger', 'Oyo'];
const valid = {
  date: '2026-10-29',
  state: 'niger state',
  lga: 'Chanchaga',
  location: 'Kure Market, Minna',
  latitude: '9.5920',
  longitude: '6.5241',
  event_type: 'Armed Robbery',
  severity: 'high',
  description: 'Traders robbed at the market.',
  fatalities: '0',
  injured: '2',
  abducted: '',
  actors: 'Armed robbers',
  source: 'OAF field staff',
  source_url: '',
  source_date: '2026-10-29',
  confidence: 'medium',
  verification_status: 'partially verified'
};
const opts = (extra = {}) => ({ operatingStates: STATES, takenIds: new Set(), now: NOW, ...extra });

describe('isAuthorizedReporter', () => {
  it('accepts the approved emails regardless of case or spaces', async () => {
    expect(await isAuthorizedReporter('zarah.suleiman@oneacrefund.org')).toBe(true);
    expect(await isAuthorizedReporter('  Muazu.Muhammad@OneAcreFund.org ')).toBe(true);
    expect(await isAuthorizedReporter('jemimah.dadakuta-c@oneacrefund.org')).toBe(true);
  });

  it('rejects any other email', async () => {
    expect(await isAuthorizedReporter('someone.else@oneacrefund.org')).toBe(false);
    expect(await isAuthorizedReporter('')).toBe(false);
  });
});

describe('buildIncidentRecord', () => {
  it('builds a row in the security_events format', () => {
    const { record, errors } = buildIncidentRecord(valid, opts({ takenIds: new Set(['EVT20261029001']) }));
    expect(errors).toEqual({});
    expect(record).toEqual({
      event_id: 'EVT20261029002',
      date: '2026-10-29',
      state: 'Niger',
      lga: 'Chanchaga',
      location: 'Kure Market, Minna',
      latitude: 9.592,
      longitude: 6.5241,
      event_type: 'Armed Robbery',
      severity: 'High',
      description: 'Traders robbed at the market.',
      fatalities: 0,
      injured: 2,
      actors: 'Armed robbers',
      source: 'OAF field staff',
      source_date: '2026-10-29',
      reported_date: '2026-10-30',
      confidence: 'Medium',
      verification_status: 'Partially Verified'
    });
    // unknown counts stay null (omitted), like the existing data
    expect(record).not.toHaveProperty('abducted');
  });

  it('treats the literal "null" as empty', () => {
    const { record } = buildIncidentRecord({ ...valid, injured: 'null', actors: 'null' }, opts());
    expect(record).not.toHaveProperty('injured');
    expect(record).not.toHaveProperty('actors');
  });

  it('rejects states outside the operating states', () => {
    const { record, errors } = buildIncidentRecord({ ...valid, state: 'Zamfara' }, opts());
    expect(record).toBeNull();
    expect(errors.state).toMatch(/not an operating state/);
  });

  it('reports every invalid field', () => {
    const { errors } = buildIncidentRecord(
      { ...valid, description: '', severity: 'Severe', latitude: '51.5', injured: '-1', source_url: 'www', date: '2027-01-01', confidence: '' },
      opts()
    );
    expect(Object.keys(errors).sort()).toEqual(['confidence', 'date', 'description', 'injured', 'latitude', 'severity', 'source_url']);
  });

  it('keeps a valid supplied event ID and rejects duplicates', () => {
    expect(buildIncidentRecord({ ...valid, event_id: 'EVT20261029007' }, opts()).record.event_id).toBe('EVT20261029007');
    const dup = buildIncidentRecord({ ...valid, event_id: 'EVT20261029007' }, opts({ takenIds: new Set(['EVT20261029007']) }));
    expect(dup.errors.event_id).toMatch(/already exists/);
  });

  it('drops keys the live table does not have', () => {
    const { record } = buildIncidentRecord(valid, opts({ columns: SCHEMA_COLUMNS.filter(c => c !== 'confidence') }));
    expect(record).not.toHaveProperty('confidence');
  });
});

describe('nextEventId', () => {
  it('numbers IDs per incident date and never repeats in a batch', () => {
    const taken = new Set(['EVT20220605001', 'EVT20220605009', 'EVT20220107001']);
    expect(nextEventId('2022-06-05', taken)).toBe('EVT20220605010');
    expect(nextEventId('2022-06-05', taken)).toBe('EVT20220605011');
    expect(nextEventId('2026-10-30', taken)).toBe('EVT20261030001');
  });
});

describe('normalizeDate', () => {
  it('accepts ISO and day-first dates', () => {
    expect(normalizeDate('2026-1-5')).toBe('2026-01-05');
    expect(normalizeDate('05/01/2026')).toBe('2026-01-05');
    expect(normalizeDate('2022-06-05 00:00:00')).toBe('2022-06-05');
    expect(normalizeDate('null')).toBeNull();
  });
});

describe('CSV template and upload', () => {
  it('template has the table columns and a parseable example row', () => {
    const csv = buildTemplateCsv();
    const [header, example] = parseCsv(csv);
    expect(header).toEqual(SCHEMA_COLUMNS);
    expect(example[SCHEMA_COLUMNS.indexOf('location')]).toBe('Kure Market, Minna');
  });

  it('skips the example row and reads quoted values', () => {
    const csv = buildTemplateCsv() +
      'EVT20220605001,2022-06-05,Oyo,Ibadan North,"Bodija Market, Ibadan",7.43,3.91,Civil Unrest,Medium,"Traders protested; police said ""calm"" returned",null,3,null,Protesters,Punch,,2022-06-05,,High,Verified\r\n';
    const { rows, missingColumns } = readIncidentCsv(csv);
    expect(missingColumns).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(3);
    expect(rows[0].values.description).toBe('Traders protested; police said "calm" returned');
    const { record, errors } = buildIncidentRecord(rows[0].values, opts());
    expect(errors).toEqual({});
    expect(record).toMatchObject({ event_id: 'EVT20220605001', state: 'Oyo', injured: 3, verification_status: 'Verified' });
  });

  it('reports missing required columns', () => {
    expect(readIncidentCsv('date,state\n2026-01-01,Kano\n').missingColumns).toContain('description');
  });
});
