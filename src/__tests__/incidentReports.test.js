import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));

const { isAuthorizedReporter, buildIncidentRecord, describeFormFields } = await import('../services/incidentReports');

const NOW = new Date('2026-10-30T12:00:00Z').getTime();
const validValues = {
  date: '2026-10-29',
  event_type: 'Kidnapping',
  severity: 'High',
  verification_status: 'Unverified',
  state: 'Niger',
  lga: 'Bosso',
  location: 'Minna-Bida road',
  latitude: '9.61',
  longitude: '6.55',
  description: 'Travellers abducted at a checkpoint.',
  fatalities: '0',
  injured: '1',
  abducted: '3',
  actors: '',
  source_url: ''
};

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
  it('builds a typed row from valid form values', () => {
    const { record, errors } = buildIncidentRecord(validValues, { now: NOW });
    expect(errors).toEqual({});
    expect(record).toMatchObject({ latitude: 9.61, longitude: 6.55, injured: 1, abducted: 3, severity: 'High' });
    expect(record).not.toHaveProperty('actors');
  });

  it('reports missing required fields and bad values', () => {
    const { record, errors } = buildIncidentRecord(
      { ...validValues, description: ' ', latitude: '51.5', injured: '-2', source_url: 'not a link', date: '2027-01-01' },
      { now: NOW }
    );
    expect(record).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['date', 'description', 'injured', 'latitude', 'source_url']);
  });

  it('only submits columns the table has and fills table-specific columns', () => {
    const columns = ['id', 'event_id', 'date', 'event_type', 'severity', 'state', 'latitude', 'longitude', 'description', 'reported_by', 'country'];
    const sample = { event_id: 'EVT-001', country: 'Nigeria' };
    const { record, errors } = buildIncidentRecord(
      { ...validValues, country: 'Nigeria' },
      { columns, sample, reporterEmail: 'Zarah.Suleiman@oneacrefund.org', now: NOW }
    );
    expect(errors).toEqual({});
    expect(Object.keys(record).sort()).toEqual(['country', 'date', 'description', 'event_id', 'event_type', 'latitude', 'longitude', 'reported_by', 'severity', 'state']);
    expect(record.event_id).toMatch(/^OAF-20261030-[A-Z0-9]{6}$/);
    expect(record.reported_by).toBe('zarah.suleiman@oneacrefund.org');
  });

  it('lets the database generate numeric ids', () => {
    const columns = ['event_id', 'date', 'event_type', 'severity', 'state', 'latitude', 'longitude', 'description'];
    const { record } = buildIncidentRecord(validValues, { columns, sample: { event_id: 42 }, now: NOW });
    expect(record).not.toHaveProperty('event_id');
  });
});

describe('describeFormFields', () => {
  it('lists extra table columns that are not system columns', () => {
    const { extraColumns } = describeFormFields(['id', 'created_at', 'date', 'country', 'reported_by']);
    expect(extraColumns).toEqual(['country']);
  });
});
