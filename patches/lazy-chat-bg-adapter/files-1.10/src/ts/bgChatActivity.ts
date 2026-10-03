import { clientBuildFetch } from './storage/clientBuildHandshake'
import { isServerOrchestrationEnabled } from './bgOrchestrate'

export interface ChatActivity {
    charId: string
    chatId: string
    busy: boolean | null
}

// Unknown availability never authorizes a replacement generation. Raw admission
// has its own authoritative queue/identity checks and does not use this UI hint.
export async function readServerChatActivity(charId: string, chatId: string): Promise<boolean> {
    if (!isServerOrchestrationEnabled()) return false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
        const response = await clientBuildFetch('/api/bg-chat-activity/'
            + encodeURIComponent(charId) + '/' + encodeURIComponent(chatId), {
            method: 'GET', credentials: 'same-origin', signal: controller.signal,
        })
        const body = await response.json()
        if (!response.ok || body?.charId !== charId || body?.chatId !== chatId
            || typeof body.busy !== 'boolean') throw new Error('Server chat activity unavailable')
        return body.busy
    } finally { clearTimeout(timer) }
}
