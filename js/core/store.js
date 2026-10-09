// Minimal document store: collections of plain objects with string ids.
// `persist(snapshot)` is called after every write (server: JSON file,
// browser demo: localStorage).
export const COLLECTIONS = ['users', 'journal', 'ruleDecisions', 'questions', 'usage', 'payments', 'overrides'];

export function createStore(initial = {}, persist = () => {}) {
  const data = {};
  for (const c of COLLECTIONS) data[c] = Array.isArray(initial[c]) ? initial[c] : [];
  const save = () => persist(JSON.parse(JSON.stringify(data)));
  return {
    all: (c) => data[c].slice(),
    find: (c, pred) => data[c].find(pred) || null,
    filter: (c, pred) => data[c].filter(pred),
    insert(c, doc) {
      data[c].push(doc);
      save();
      return doc;
    },
    update(c, id, patch) {
      const doc = data[c].find((d) => d.id === id);
      if (!doc) return null;
      Object.assign(doc, patch);
      save();
      return doc;
    },
    remove(c, id) {
      const i = data[c].findIndex((d) => d.id === id);
      if (i >= 0) data[c].splice(i, 1);
      save();
    },
    snapshot: () => JSON.parse(JSON.stringify(data)),
  };
}
