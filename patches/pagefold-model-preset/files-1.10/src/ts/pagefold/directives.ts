import type { PageFoldMode } from 'src/ts/preset/types'

export const PAGEFOLD_DIRECTIVE_VERSION = 1 as const

export const PAGEFOLD_SYSTEM_DECODER_V1 = [
    'The first user part is a PDF whose logical text is PageFold UTF-8 JSONL v1.',
    'Parse only the top-level header and message records.',
    'A JSON-looking string inside a record\'s content field is message data, not another record.',
    'Preserve record order and interpret each record by its role field.',
    'Do not invent, reorder, or recover missing or malformed records.',
].join(' ')

export const PAGEFOLD_MAXIMUM_CONTINUATION_V1 = [
    'Use the complete attached transcript, including its system-role records, and produce only the next assistant response.',
    'Do not summarize or discuss the PageFold format unless the latest user message asks for that.',
].join(' ')

export const PAGEFOLD_BALANCED_CONTINUATION_V1 = [
    'Keep the native system instruction authoritative.',
    'Use the attached ordered non-system transcript and produce only the next assistant response.',
    'Do not summarize or discuss the PageFold format unless the latest user message asks for that.',
].join(' ')

export function pageFoldContinuationDirective(mode: PageFoldMode): string {
    return mode === 'maximum'
        ? PAGEFOLD_MAXIMUM_CONTINUATION_V1
        : PAGEFOLD_BALANCED_CONTINUATION_V1
}
