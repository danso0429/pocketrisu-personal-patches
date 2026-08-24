/**
 * Owner-local adaptation of Haejeok RisuAI's 600px chat-width outcome.
 *
 * PocketRisu 1.10 already owns Standard, Wide, and Full widths across message
 * cards, creator notes, and the composer. This helper adds only the missing
 * Small value and keeps that native width authority intact.
 *
 * Source basis: Haejeok RisuAI commit
 * 0243d0781fdbcca0768fa8ef2c0df6d365d8d27f.
 */

export type NodeOnlyStandardChatWidth = 'small' | 'standard' | 'wide' | 'full'

export function normalizeNodeOnlyStandardChatWidth(
    value: unknown,
): NodeOnlyStandardChatWidth {
    switch (value) {
        case 'small':
        case 'wide':
        case 'full':
            return value
        default:
            return 'standard'
    }
}

export function nodeOnlyStandardChatWidthClass(value: unknown): string {
    switch (normalizeNodeOnlyStandardChatWidth(value)) {
        case 'small': return 'nodeonly-chat-width-small'
        case 'wide': return 'max-w-6xl'
        case 'full': return 'max-w-full'
        case 'standard': return 'max-w-3xl'
    }
}
