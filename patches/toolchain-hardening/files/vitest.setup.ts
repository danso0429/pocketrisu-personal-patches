import { vi } from 'vitest'
import { Storage } from 'happy-dom'

// Suppress warning
vi.mock(import('katex'), () => ({}))

vi.stubGlobal('safeStructuredClone', (v: unknown) => JSON.parse(JSON.stringify(v)))

function hasUsableLocalStorage() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  return Boolean(
    descriptor
    && 'value' in descriptor
    && typeof descriptor.value?.clear === 'function',
  )
}

if (!hasUsableLocalStorage()) {
  vi.stubGlobal('localStorage', new Storage())
}
