'use strict'

const SENSITIVE_KEYS = new Set([
  'authorization', 'proxy-authorization', 'x-api-key', 'x-goog-api-key',
  'apikey', 'api_key', 'accesstoken', 'access_token', 'private_key',
  'privatekey', 'serviceaccountjson', 'service_account_json', 'assertion',
])

function redactPageFoldRequestLogText(input) {
  const text = String(input)
  try {
    return JSON.stringify(redactValue(JSON.parse(text)))
  } catch {
    return text
      .replace(/("(?:inlineData|inline_data)"\s*:\s*\{[^{}]*?"data"\s*:\s*")[A-Za-z0-9+/=]+("[^{}]*\})/gi, '$1[media omitted]$2')
      .replace(/("(?:private_key|serviceAccountJson|access_token)"\s*:\s*")[^"]*(")/gi, '$1[redacted]$2')
  }
}

function redactPageFoldRequestLogUrl(input) {
  const text = String(input || '')
  try {
    const url = new URL(text)
    for (const key of [...url.searchParams.keys()]) {
      if (['key', 'api_key', 'apikey', 'token', 'access_token'].includes(key.toLowerCase())) {
        url.searchParams.set(key, 'REDACTED')
      }
    }
    return url.toString()
  } catch {
    return text.replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&#\s]*/gi, '$1REDACTED')
  }
}

function redactValue(value, key = '') {
  if (SENSITIVE_KEYS.has(String(key).toLowerCase())) return '[redacted]'
  if (Array.isArray(value)) return value.map((item) => redactValue(item))
  if (!value || typeof value !== 'object') return value
  const isInline = key === 'inlineData' || key === 'inline_data'
  const out = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (isInline && childKey === 'data') {
      const mime = typeof value.mimeType === 'string' ? value.mimeType : 'media'
      const bytes = typeof child === 'string' ? Math.max(0, Math.floor(child.length * 0.75)) : 0
      out[childKey] = `[${mime}: ${bytes} bytes omitted]`
    } else {
      out[childKey] = redactValue(child, childKey)
    }
  }
  return out
}

module.exports = { redactPageFoldRequestLogText, redactPageFoldRequestLogUrl }
