export function readStored(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

export function writeStored(key, value) {
  try { localStorage.setItem(key, value); return true } catch { return false }
}

export function readStoredObject(key) {
  try {
    const value = JSON.parse(readStored(key, '{}'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}
