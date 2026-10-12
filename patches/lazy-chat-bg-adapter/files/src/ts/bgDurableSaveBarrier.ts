/**
 * BG result delivery may acknowledge an operation only after both layers of
 * lazy-chat persistence are durable:
 *
 * 1. the chat body write has been accepted and staged in the server journal;
 * 2. the database stub/root metadata has been flushed to the durable DB blob.
 *
 * Keep this separate from chat transport revisions. BG merge revisions are a
 * semantic edit detector, while lazy-chat ETags are exact transport CAS tokens.
 */
// Shared with the native autosave rebase policy. This is a persistence retry
// bound, never a model/provider retry or a successful-save substitute.
export const BG_SAVE_MAX_REBASE_ATTEMPTS = 5
export const BG_DURABLE_SAVE_RETRY = 'BG_DURABLE_SAVE_RETRY'

export async function completeBgDurableSave(
    committed: boolean,
    flushDatabase: () => Promise<unknown>,
): Promise<void> {
    if (!committed) {
        throw new Error('durable save deferred; orchestration result retained')
    }
    await flushDatabase()
}
