/**
 * Reads every row of a table. Supabase caps each response at the project's "Max rows"
 * setting (1,000 by default, sometimes lower), so a single select silently stops there.
 * This asks for the exact row count, then pages through the table in a stable order
 * (stepping by however many rows each response actually returned) until it has them all.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} table
 * @param {{ orderBy: string, pageSize?: number, maxRows?: number }} options
 * @returns {Promise<Array<Object>>} Rows, with a `totalCount` property (the table's count)
 */
export async function fetchAllRows(supabase, table, { orderBy, pageSize = 1000, maxRows = 200000 } = {}) {
  const rows = [];
  let total = null;
  while (rows.length < maxRows) {
    let query = supabase.from(table).select('*', total === null ? { count: 'exact' } : undefined);
    if (orderBy) query = query.order(orderBy, { ascending: true });
    const { data, error, count } = await query.range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (total === null && typeof count === 'number') total = count;
    if (!data || data.length === 0) break;
    rows.push(...data);
    // Without a count, a short page is the end; with one, keep going until every row is in
    if (total === null ? data.length < pageSize : rows.length >= total) break;
  }
  rows.totalCount = total ?? rows.length;
  return rows;
}
