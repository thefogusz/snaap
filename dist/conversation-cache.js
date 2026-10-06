// Session memory only. Never reuse another account's or workspace's list.
export function createConversationCache({load, scope, now = Date.now, staleTime = 30000}) {
  const entries = new Map();
  let owner;
  function entry() {
    const current = scope();
    if (current.owner !== owner) { entries.clear(); owner = current.owner; }
    const key = current.workspace ?? '';
    if (!entries.has(key)) {
      if (entries.size >= 5) entries.delete(entries.keys().next().value);
      entries.set(key, {rows: [], ready: false, at: 0, version: 0, pending: null});
    }
    return entries.get(key);
  }
  function read() {
    const value = entry();
    return {rows: value.rows, ready: value.ready, fresh: value.ready && now() - value.at < staleTime};
  }
  function upsert(row, {invalidate = true} = {}) {
    const value = entry();
    const existing = value.rows.find(item => item.id === row.id);
    if (existing) Object.assign(existing, row);
    else value.rows.unshift(row);
    value.version++;
    // A mutation racing a list response must win. Revalidate on the next open.
    if (invalidate) value.at = -Infinity;
  }
  function list({force = false} = {}) {
    const value = entry();
    if (value.pending) return value.pending;
    if (!force && read().fresh) return Promise.resolve(value.rows);
    const version = value.version;
    const started = performance.now();
    value.pending = load().then(rows => {
      if (version === value.version) {
        const previous = new Map(value.rows.map(row => [row.id, row]));
        // Keep loaded detail fields; the summary response only replaces metadata.
        value.rows = rows.map(row => ({...previous.get(row.id), ...row}));
        value.ready = true;
        value.at = now();
      }
      recordConversationTiming('list', started, {outcome: 'success', rows: rows.length});
      return value.rows;
    }, error => {
      recordConversationTiming('list', started, {outcome: 'error'});
      throw error;
    }).finally(() => { value.pending = null; });
    return value.pending;
  }
  return {read, list, upsert};
}

// Keep only the latest sample per phase; no chat text, user IDs or credentials.
export function recordConversationTiming(phase, started, detail = {}) {
  const name = `snaap:conversations:${phase}`;
  performance.clearMeasures(name);
  performance.measure(name, {start: started, end: performance.now(), detail});
}
