export const FRESH_SNAPSHOT_REQUIRED_CODE = 'fresh_snapshot_required'
export const RESTORE_WITHOUT_FRESH_SNAPSHOT_HEADER = 'x-risu-restore-without-fresh-snapshot'
export const RESTORE_CONFIRMATION_HEADER = 'x-risu-restore-confirmation'
export const RESTORE_SOURCE_ID_HEADER = 'x-risu-restore-source-id'

export interface RestoreSafetyOptions {
    allowWithoutFreshSnapshot?: boolean
    confirmationToken?: string
}

type RestoreFailurePayload = {
    code?: unknown
    confirmationToken?: unknown
    error?: unknown
    message?: unknown
}

export function restoreSafetyHeaders(options: RestoreSafetyOptions = {}): Record<string, string> {
    if (options.allowWithoutFreshSnapshot !== true) return {}
    if (typeof options.confirmationToken !== 'string' || !options.confirmationToken) {
        throw new Error('Restore confirmation token is required')
    }
    return {
        [RESTORE_WITHOUT_FRESH_SNAPSHOT_HEADER]: '1',
        [RESTORE_CONFIRMATION_HEADER]: options.confirmationToken,
    }
}

export function localRestoreSourceHeaders(file: Blob): Record<string, string> {
    const lastModified = 'lastModified' in file
        && Number.isSafeInteger((file as Blob & { lastModified?: unknown }).lastModified)
        ? String((file as Blob & { lastModified: number }).lastModified)
        : '0'
    return {
        [RESTORE_SOURCE_ID_HEADER]: `${file.size}:${lastModified}`,
    }
}

export function restoreErrorFromPayload(payload: unknown, fallback: string): Error {
    const candidate = payload && typeof payload === 'object'
        ? payload as RestoreFailurePayload
        : {}
    const message = typeof candidate.message === 'string'
        ? candidate.message
        : typeof candidate.error === 'string'
            ? candidate.error
            : fallback
    const error = new Error(message)
    if (candidate.code === FRESH_SNAPSHOT_REQUIRED_CODE) {
        const structured = error as Error & { code: string, confirmationToken?: string }
        structured.code = FRESH_SNAPSHOT_REQUIRED_CODE
        if (typeof candidate.confirmationToken === 'string' && candidate.confirmationToken) {
            structured.confirmationToken = candidate.confirmationToken
        }
    }
    return error
}

export function isFreshSnapshotRequiredError(
    error: unknown,
): error is Error & { code: string, confirmationToken: string } {
    return error instanceof Error
        && (error as Error & { code?: unknown }).code === FRESH_SNAPSHOT_REQUIRED_CODE
        && typeof (error as Error & { confirmationToken?: unknown }).confirmationToken === 'string'
        && Boolean((error as Error & { confirmationToken?: string }).confirmationToken)
}

export function acknowledgedRestoreOptions(
    error: Error & { confirmationToken: string },
): RestoreSafetyOptions {
    return {
        allowWithoutFreshSnapshot: true,
        confirmationToken: error.confirmationToken,
    }
}

export function restoreWithoutFreshSnapshotPrompt(error: Error): string {
    return `${error.message}\n\nContinue this restore without a new pre-restore snapshot?`
}
