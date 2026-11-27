import { describe, it, expect } from 'vitest';
import { reviewQueue, reviewChanges, hasReviewColumns } from '../utils/incidentSchema';

const NOW = new Date('2026-11-27T12:00:00Z').getTime();
const rows = [
  { event_id: 'old', created_at: '2026-10-01T10:00:00Z', reviewed_at: null },
  { event_id: 'new1', created_at: '2026-11-26T10:00:00Z', reviewed_at: null },
  { event_id: 'new2', created_at: '2026-11-27T09:00:00Z', reviewed_at: null },
  { event_id: 'done', created_at: '2026-11-25T09:00:00Z', reviewed_at: '2026-11-26T08:00:00Z' }
];

describe('review queue', () => {
  it('lists unreviewed incidents added recently, newest first', () => {
    expect(reviewQueue(rows, { now: NOW }).map(r => r.event_id)).toEqual(['new2', 'new1']);
    expect(reviewQueue(rows, { now: NOW, days: null }).map(r => r.event_id)).toEqual(['new2', 'new1', 'old']);
  });

  it('lists reviewed incidents separately', () => {
    expect(reviewQueue(rows, { now: NOW, show: 'reviewed' }).map(r => r.event_id)).toEqual(['done']);
  });
});

describe('reviewChanges', () => {
  it('records the decision, corrections, reviewer and time', () => {
    expect(reviewChanges('Verified', { severity: 'High' }, { reviewer: 'a@oneacrefund.org', note: ' DSS confirmed ', now: NOW })).toEqual({
      severity: 'High', verification_status: 'Verified', is_hidden: false,
      reviewed_by: 'a@oneacrefund.org', reviewed_at: '2026-11-27T12:00:00.000Z', review_note: 'DSS confirmed'
    });
  });

  it('hides without changing the verification status', () => {
    const changes = reviewChanges('hide', {}, { reviewer: 'a@oneacrefund.org', now: NOW });
    expect(changes.is_hidden).toBe(true);
    expect(changes).not.toHaveProperty('verification_status');
  });
});

it('detects whether the review columns exist', () => {
  expect(hasReviewColumns([{ reviewed_by: null, reviewed_at: null, review_note: null, is_hidden: false }])).toBe(true);
  expect(hasReviewColumns([{ event_id: 'x' }])).toBe(false);
  expect(hasReviewColumns([])).toBe(false);
});
