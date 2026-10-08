import assert from 'node:assert/strict'
export function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)])); let queue = Promise.resolve()
  const store = {
    data,
    async get(path) { return structuredClone(data.get(path) ?? null) },
    async list(path) { return [...data].filter(([key]) => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1).map(([key, value]) => ({ ...structuredClone(value), id: key.split('/').at(-1) })) },
    transaction(callback) {
      const result = queue.then(async () => {
        let writing = false; const writes = []
        const result = await callback({ async get(path) { assert.equal(writing, false, 'Firestore must read before writes'); return store.get(path) }, set(path, value) { writing = true; writes.push([path, structuredClone(value)]) }, delete(path) { writing = true; writes.push([path, null]) } })
        for (const [path, value] of writes) value === null ? data.delete(path) : data.set(path, value)
        return result
      }); queue = result.catch(() => {}); return result
    },
  }; return store
}
