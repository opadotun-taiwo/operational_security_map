/**
 * Reads every row of a table. Supabase returns at most 1,000 rows per request (the
 * project's "Max rows" setting), so a single select silently stops there; this pages
 * through the table in a stable order until a short page comes back.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} table
 * @param {{ orderBy: string, pageSize?: number, maxRows?: number }} options
 * @returns {Promise<Array<Object>>}
 */
export async function fetchAllRows(supabase, table, { orderBy, pageSize = 1000, maxRows = 200000 } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    let query = supabase.from(table).select('*');
    if (orderBy) query = query.order(orderBy, { ascending: true });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
