import { BG_DURABLE_SAVE_RETRY, BG_SAVE_MAX_REBASE_ATTEMPTS } from './bgDurableSaveBarrier'

// Only an explicit persistence retry is eligible. Unknown/noop, inactive
// writer, manual conflict and publication refusal remain fail-closed.
export async function saveServerInputSettings(
    save: () => Promise<void>,
    isCurrent: () => boolean,
): Promise<void> {
    for (let attempt = 0; attempt < BG_SAVE_MAX_REBASE_ATTEMPTS; attempt++) {
        if (!isCurrent()) throw new Error('server input settings target changed')
        try { await save(); return }
        catch (error) {
            if (!isCurrent() || (error as { code?: unknown })?.code !== BG_DURABLE_SAVE_RETRY
                || attempt + 1 >= BG_SAVE_MAX_REBASE_ATTEMPTS) throw error
        }
    }
}
