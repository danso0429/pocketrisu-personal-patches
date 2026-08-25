const OMITTED = '[media omitted]'
const SENSITIVE_KEYS = new Set([
    'authorization', 'proxy-authorization', 'x-api-key', 'x-goog-api-key',
    'apikey', 'api_key', 'accesstoken', 'access_token', 'private_key',
    'privatekey', 'serviceaccountjson', 'service_account_json', 'assertion',
])
const SENSITIVE_QUERY = new Set(['key', 'api_key', 'apikey', 'token', 'access_token'])

export function redactRequestLogBody(body: unknown): string | undefined {
    if (body == null) return undefined
    if (typeof body === 'string') {
        try {
            return JSON.stringify(redactValue(JSON.parse(body)))
        } catch {
            return stripDataUrls(body)
        }
    }
    if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
        try {
            const bytes = body instanceof Uint8Array ? body : new Uint8Array(body)
            return redactRequestLogBody(new TextDecoder().decode(bytes))
        } catch {
            return `[binary ${(body as Uint8Array).byteLength ?? 0} bytes]`
        }
    }
    try {
        return JSON.stringify(redactValue(body))
    } catch {
        return String(body)
    }
}

export function redactRequestLogHeaders(headers: unknown): string | undefined {
    if (!headers) return undefined
    try {
        const entries = headers instanceof Headers
            ? Object.fromEntries(headers.entries())
            : headers
        return JSON.stringify(redactValue(entries))
    } catch {
        return undefined
    }
}

export function redactRequestLogUrl(input: string): string {
    try {
        const url = new URL(input, 'http://pagefold.invalid')
        for (const key of [...url.searchParams.keys()]) {
            if (SENSITIVE_QUERY.has(key.toLowerCase())) url.searchParams.set(key, '[redacted]')
        }
        return /^[a-z][a-z0-9+.-]*:/i.test(input)
            ? url.toString()
            : `${url.pathname}${url.search}${url.hash}`
    } catch {
        return input.replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&#\s]*/gi, '$1[redacted]')
    }
}

export function redactPreparedRequestForDisplay(input: {
    url: string
    body: Record<string, unknown>
    headers: Record<string, string>
}): { url: string, body: unknown, headers: unknown } {
    return {
        url: redactRequestLogUrl(input.url),
        body: redactValue(input.body),
        headers: redactValue(input.headers),
    }
}

function redactValue(value: unknown, key = '', parent?: Record<string, unknown>): unknown {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) return '[redacted]'
    if (typeof value === 'string') return stripDataUrls(value)
    if (value instanceof Uint8Array) return `[binary ${value.byteLength} bytes omitted]`
    if (value instanceof ArrayBuffer) return `[binary ${value.byteLength} bytes omitted]`
    if (Array.isArray(value)) return value.map((item) => redactValue(item))
    if (!value || typeof value !== 'object') return value

    const source = value as Record<string, unknown>
    const isInlineMedia = key.toLowerCase() === 'inlinedata' || key.toLowerCase() === 'inline_data'
    const isDocument = source.kind === 'document'
    const out: Record<string, unknown> = {}
    for (const [childKey, child] of Object.entries(source)) {
        const lower = childKey.toLowerCase()
        if ((isInlineMedia && lower === 'data')
            || (isDocument && (lower === 'bytes' || lower === 'base64'))) {
            const mime = typeof source.mimeType === 'string'
                ? source.mimeType
                : typeof source.mime === 'string' ? source.mime : 'media'
            const size = typeof child === 'string'
                ? Math.max(0, Math.floor(child.length * 0.75))
                : child instanceof Uint8Array || child instanceof ArrayBuffer ? child.byteLength : 0
            out[childKey] = `[${mime}: ${size} bytes omitted]`
            continue
        }
        out[childKey] = redactValue(child, childKey, source)
    }
    void parent
    return out
}

function stripDataUrls(value: string): string {
    return value.replace(
        /data:([a-z]+)\/([a-z0-9.+-]+);base64,[A-Za-z0-9+/=]+/gi,
        (_match, type: string, subtype: string) => `[${type}/${subtype}: ${OMITTED}]`,
    )
}
