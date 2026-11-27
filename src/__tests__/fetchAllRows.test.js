import { describe, it, expect } from 'vitest';
import { fetchAllRows } from '../services/fetchAllRows';

/** Fake Supabase table that, like the real API, never returns more than 1,000 rows. */
function fakeSupabase(total, { cap = 1000, failAt = null } = {}) {
  const table = Array.from({ length: total }, (_, i) => ({ event_id: `EVT${String(i).padStart(6, '0')}` }));
  const calls = [];
  return {
    calls,
    from: () => {
      const state = {};
      const q = {
        select: () => q,
        order: (col) => { state.order = col; return q; },
        range: (from, to) => {
          calls.push([from, to, state.order]);
          if (failAt !== null && from >= failAt) return Promise.resolve({ data: null, error: new Error('boom') });
          const limit = Math.min(to - from + 1, cap);
          return Promise.resolve({ data: table.slice(from, from + limit), error: null });
        }
      };
      return q;
    }
  };
}

describe('fetchAllRows', () => {
  it('returns every row past the 1,000-row API limit', async () => {
    const sb = fakeSupabase(2537);
    const rows = await fetchAllRows(sb, 'security_events', { orderBy: 'event_id' });
    expect(rows).toHaveLength(2537);
    expect(new Set(rows.map(r => r.event_id)).size).toBe(2537);
    expect(sb.calls).toEqual([[0, 999, 'event_id'], [1000, 1999, 'event_id'], [2000, 2999, 'event_id']]);
  });

  it('handles an exact multiple of the page size and an empty table', async () => {
    expect(await fetchAllRows(fakeSupabase(2000), 't', { orderBy: 'id' })).toHaveLength(2000);
    expect(await fetchAllRows(fakeSupabase(0), 't', { orderBy: 'id' })).toEqual([]);
  });

  it('surfaces errors instead of returning a partial list', async () => {
    await expect(fetchAllRows(fakeSupabase(2500, { failAt: 1000 }), 't', { orderBy: 'id' })).rejects.toThrow('boom');
  });
});
