import { vi } from 'vitest'
import { Storage } from 'happy-dom'

// Suppress warning
vi.mock(import('katex'), () => ({}))

vi.stubGlobal('safeStructuredClone', (v: unknown) => JSON.parse(JSON.stringify(v)))

if (typeof globalThis.localStorage?.clear !== 'function') {
  vi.stubGlobal('localStorage', new Storage())
}
