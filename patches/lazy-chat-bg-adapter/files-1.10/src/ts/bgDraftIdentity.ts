export function validDraftIdentity(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value)
}

export async function legacyDraftIdentity(
    charId: string,
    chatId: string,
    message: string,
    translation: string,
): Promise<string> {
    if (!globalThis.crypto?.subtle) {
        throw new Error('draft identity digest is unavailable')
    }
    const bytes = new TextEncoder().encode(JSON.stringify([
        'pocketrisu_legacy_draft_v1', charId, chatId, message, translation,
    ]))
    const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
    return 'legacy_' + Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
}
