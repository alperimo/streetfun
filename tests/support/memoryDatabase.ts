/** Test-only Supabase double. Production code has no simulation mode. */
export function memoryDatabase(initial: Record<string, Record<string, unknown>[]> = {}) {
  const tables = new Map(Object.entries(initial));
  return { from(table: string) {
    const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
    let sort: { key: string; ascending: boolean } | null = null, offset = 0, count = Infinity;
    let patch: Record<string, unknown> | undefined;
    const query = {
      select(_fields = "*") { return query; },
      eq(key: string, value: unknown) { predicates.push(row => row[key] === value); return query; },
      neq(key: string, value: unknown) { predicates.push(row => row[key] !== value); return query; },
      is(key: string, value: unknown) { predicates.push(row => value === null ? row[key] == null : row[key] === value); return query; },
      in(key: string, values: unknown[]) { predicates.push(row => values.includes(row[key])); return query; },
      gte(key: string, value: string | number) { predicates.push(row => typeof value === "number" ? Number(row[key]) >= value : String(row[key]) >= value); return query; },
      lte(key: string, value: string | number) { predicates.push(row => typeof value === "number" ? Number(row[key]) <= value : String(row[key]) <= value); return query; },
      update(value: Record<string, unknown>) { patch = value; return query; },
      order(key: string, options = { ascending: true }) { sort = { key, ...options }; return query; },
      limit(value: number) { count = value; return query; },
      range(start: number, end: number) { offset = start; count = end - start + 1; return query; },
      upsert(value: Record<string, unknown>, options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        const rows = tables.get(table) || []; const fields = (options.onConflict || "mint").split(",");
        const index = rows.findIndex(row => fields.every(key => (row[key] || 0) === (value[key] || 0)));
        if (index < 0) rows.push(value); else if (!options.ignoreDuplicates) rows[index] = value;
        tables.set(table, rows); return Promise.resolve({ error: null });
      },
      async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> { const result = await query; return { data: result.data[0] || null, error: null }; },
      then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
        let rows = (tables.get(table) || []).filter(row => predicates.every(p => p(row)));
        if (patch) rows.forEach(row => Object.assign(row, patch));
        if (sort) { const { key, ascending } = sort; rows = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1)); }
        return Promise.resolve({ data: rows.slice(offset, offset + count), error: null }).then(resolve);
      },
    };
    return query;
  } };
}
