import { vi } from 'vitest'
import { Storage } from 'happy-dom'

// Suppress warning
vi.mock(import('katex'), () => ({}))

vi.stubGlobal('safeStructuredClone', (v: unknown) => JSON.parse(JSON.stringify(v)))

function hasUsableLocalStorage() {
  try {
    return typeof globalThis.localStorage?.clear === 'function'
  } catch {
    return false
  }
}

if (!hasUsableLocalStorage()) {
  vi.stubGlobal('localStorage', new Storage())
}
