export interface ClientInputRecovery {
    operationId: string
    charId: string
    chatId: string
    token: string
    baseRevision: string
    command: { rawText: string; userMessageId: string; submittedAt: number }
}

export function clientInputGlobalIntent(before: Record<string, unknown>, after: Record<string, unknown>) {
    const changed: Record<string, unknown> = Object.create(null)
    const expected: Record<string, { present: boolean; value?: unknown }> = Object.create(null)
    const deleted: string[] = []
    const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key)
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (own(before, key) === own(after, key) && JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
        expected[key] = own(before, key) ? { present: true, value: before[key] } : { present: false }
        if (own(after, key)) changed[key] = after[key]
        else deleted.push(key)
    }
    return { changed, deleted, expected }
}
