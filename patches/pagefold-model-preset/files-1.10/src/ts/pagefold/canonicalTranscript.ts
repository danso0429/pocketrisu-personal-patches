import type { AdapterChatMessage } from 'src/ts/preset/adapter'
import type { ResolvedTask } from 'src/ts/preset/types'

export const PAGEFOLD_TRANSFORM_VERSION = 1 as const
export const PAGEFOLD_SERIALIZER_VERSION = 1 as const

export type PageFoldMode = 'maximum' | 'balanced'
export type PageFoldBindingSource = 'chat' | 'global-lock-default' | 'module'

export interface PageFoldTransformInput {
    version: typeof PAGEFOLD_TRANSFORM_VERSION
    task: ResolvedTask
    binding: {
        source: PageFoldBindingSource
        moduleId?: string
    }
    preset: {
        id: string
        updatedAt: number
        profileId: string
        profileVersion: number
        providerBaseVersion: number
        wireModel: string
    }
    config: {
        mode: PageFoldMode
        serializerVersion: typeof PAGEFOLD_SERIALIZER_VERSION
        layoutVersion: number
        fontVersion: string
    }
    messages: readonly AdapterChatMessage[]
}

export interface PageFoldCanonicalHeader {
    type: 'pagefold-transcript'
    version: typeof PAGEFOLD_SERIALIZER_VERSION
    sourceMessageCount: number
    messageCount: number
    task: ResolvedTask
    mode: PageFoldMode
}

export interface PageFoldCanonicalMessage {
    type: 'message'
    index: number
    sourceIndex: number
    role: AdapterChatMessage['role']
    name: string | null
    toolCallId: string | null
    content: string
    attachments: []
}

export interface PageFoldCanonicalTranscript {
    header: PageFoldCanonicalHeader
    messages: readonly PageFoldCanonicalMessage[]
    text: string
    bytes: Uint8Array
    /**
     * Original system rows retained for balanced mode. The provider adapter,
     * not the serializer, applies its existing system-message combination rule.
     */
    retainedSystemMessages: readonly {
        sourceIndex: number
        message: AdapterChatMessage
    }[]
}

export type PageFoldCanonicalErrorCode =
    | 'invalid-transform'
    | 'unsupported-message-metadata'
    | 'invalid-utf8'
    | 'invalid-canonical-document'
    | 'non-canonical-document'

export class PageFoldCanonicalError extends Error {
    readonly code: PageFoldCanonicalErrorCode

    constructor(code: PageFoldCanonicalErrorCode, message: string) {
        super(message)
        this.name = 'PageFoldCanonicalError'
        this.code = code
    }
}

const TASKS = new Set<ResolvedTask>([
    'model',
    'submodel',
    'memory',
    'emotion',
    'translate',
    'otherAx',
])
const MODES = new Set<PageFoldMode>(['maximum', 'balanced'])
const ROLES = new Set<AdapterChatMessage['role']>(['system', 'user', 'assistant', 'tool'])

const HEADER_KEYS = [
    'type',
    'version',
    'sourceMessageCount',
    'messageCount',
    'task',
    'mode',
] as const
const MESSAGE_KEYS = [
    'type',
    'index',
    'sourceIndex',
    'role',
    'name',
    'toolCallId',
    'content',
    'attachments',
] as const

/**
 * Serialize the final, post-replacer/trigger/reformater AdapterChatMessage[].
 * This function is pure: it does not read database state, credentials, or an
 * earlier OpenAIChat snapshot, and it never mutates the supplied messages.
 */
export function serializePageFoldCanonicalTranscript(
    input: PageFoldTransformInput,
): PageFoldCanonicalTranscript {
    validateTransformInput(input)

    const rows: PageFoldCanonicalMessage[] = []
    const retainedSystemMessages: Array<{ sourceIndex: number, message: AdapterChatMessage }> = []
    for (let sourceIndex = 0; sourceIndex < input.messages.length; sourceIndex++) {
        const message = input.messages[sourceIndex]
        validateAdapterMessage(message, sourceIndex)
        if (input.config.mode === 'balanced' && message.role === 'system') {
            retainedSystemMessages.push({ sourceIndex, message })
            continue
        }
        rows.push({
            type: 'message',
            index: rows.length,
            sourceIndex,
            role: message.role,
            name: message.name ?? null,
            toolCallId: message.toolCallId ?? null,
            content: message.content,
            attachments: [],
        })
    }

    const header: PageFoldCanonicalHeader = {
        type: 'pagefold-transcript',
        version: PAGEFOLD_SERIALIZER_VERSION,
        sourceMessageCount: input.messages.length,
        messageCount: rows.length,
        task: input.task,
        mode: input.config.mode,
    }
    const text = [encodeHeader(header), ...rows.map(encodeMessage)].join('\n') + '\n'
    const bytes = new TextEncoder().encode(text)

    // Re-read our own bytes through the strict parser. This catches a future
    // encoder change that creates malformed UTF-8, record order, or counts
    // before renderer/provider work can begin.
    const parsed = parsePageFoldCanonicalTranscript(bytes)
    if (parsed.text !== text) {
        throw new PageFoldCanonicalError(
            'non-canonical-document',
            'Canonical transcript failed deterministic round-trip validation',
        )
    }

    return {
        header,
        messages: rows,
        text,
        bytes,
        retainedSystemMessages,
    }
}

/** Strictly parse and re-encode a canonical transcript. */
export function parsePageFoldCanonicalTranscript(
    bytes: Uint8Array,
): Omit<PageFoldCanonicalTranscript, 'retainedSystemMessages'> {
    let text: string
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
        throw new PageFoldCanonicalError('invalid-utf8', 'Canonical transcript is not valid UTF-8')
    }
    if (!text.endsWith('\n') || text.length === 0) {
        throw invalidDocument('Canonical transcript must end with exactly one record LF')
    }

    const body = text.slice(0, -1)
    const lines = body.split('\n')
    if (lines.some((line) => line.length === 0 || line.includes('\r'))) {
        throw invalidDocument('Canonical transcript contains an empty or CR-delimited record')
    }

    const header = parseHeader(lines[0])
    if (lines.length !== header.messageCount + 1) {
        throw invalidDocument('Header messageCount does not match physical record count')
    }

    const messages: PageFoldCanonicalMessage[] = []
    let previousSourceIndex = -1
    for (let index = 0; index < header.messageCount; index++) {
        const message = parseMessage(lines[index + 1])
        if (message.index !== index) {
            throw invalidDocument('Message indices must be zero-based and contiguous')
        }
        if (message.sourceIndex <= previousSourceIndex || message.sourceIndex >= header.sourceMessageCount) {
            throw invalidDocument('Message sourceIndex must be strictly increasing and in source bounds')
        }
        if (header.mode === 'maximum' && message.sourceIndex !== index) {
            throw invalidDocument('Maximum mode sourceIndex must be contiguous')
        }
        previousSourceIndex = message.sourceIndex
        messages.push(message)
    }
    if (header.mode === 'maximum' && header.sourceMessageCount !== header.messageCount) {
        throw invalidDocument('Maximum mode must contain every source message')
    }

    const canonicalText = [encodeHeader(header), ...messages.map(encodeMessage)].join('\n') + '\n'
    if (canonicalText !== text) {
        throw new PageFoldCanonicalError(
            'non-canonical-document',
            'Transcript is valid JSON but does not use the canonical property or escape form',
        )
    }
    const canonicalBytes = new TextEncoder().encode(canonicalText)
    if (!equalBytes(canonicalBytes, bytes)) {
        throw new PageFoldCanonicalError(
            'non-canonical-document',
            'Transcript bytes are not the unique canonical UTF-8 encoding',
        )
    }
    return { header, messages, text, bytes: new Uint8Array(bytes) }
}

/** Dedicated JSON string encoder; caller object enumeration is never used. */
export function encodePageFoldJsonString(value: string): string {
    let out = '"'
    for (let index = 0; index < value.length; index++) {
        const unit = value.charCodeAt(index)
        if (unit === 0x22) { out += '\\"'; continue }
        if (unit === 0x5C) { out += '\\\\'; continue }
        if (unit === 0x08) { out += '\\b'; continue }
        if (unit === 0x09) { out += '\\t'; continue }
        if (unit === 0x0A) { out += '\\n'; continue }
        if (unit === 0x0C) { out += '\\f'; continue }
        if (unit === 0x0D) { out += '\\r'; continue }
        if (unit <= 0x1F || (unit >= 0x7F && unit <= 0x9F)) {
            out += escapeUtf16Unit(unit)
            continue
        }

        if (unit >= 0xD800 && unit <= 0xDBFF) {
            const next = value.charCodeAt(index + 1)
            if (next >= 0xDC00 && next <= 0xDFFF) {
                const codePoint = ((unit - 0xD800) * 0x400) + (next - 0xDC00) + 0x10000
                if (mustEscapeCodePoint(codePoint)) {
                    out += escapeUtf16Unit(unit) + escapeUtf16Unit(next)
                } else {
                    out += value[index] + value[index + 1]
                }
                index++
                continue
            }
            out += escapeUtf16Unit(unit)
            continue
        }
        if (unit >= 0xDC00 && unit <= 0xDFFF) {
            out += escapeUtf16Unit(unit)
            continue
        }
        if (mustEscapeCodePoint(unit)) {
            out += escapeUtf16Unit(unit)
            continue
        }
        out += value[index]
    }
    return out + '"'
}

function validateTransformInput(input: PageFoldTransformInput): void {
    if (!input || typeof input !== 'object'
        || input.version !== PAGEFOLD_TRANSFORM_VERSION
        || !TASKS.has(input.task)
        || !input.config
        || !MODES.has(input.config.mode)
        || input.config.serializerVersion !== PAGEFOLD_SERIALIZER_VERSION
        || !Array.isArray(input.messages)) {
        throw new PageFoldCanonicalError('invalid-transform', 'Unsupported PageFold transform input')
    }
}

function validateAdapterMessage(message: AdapterChatMessage, sourceIndex: number): void {
    if (!message || typeof message !== 'object'
        || !ROLES.has(message.role)
        || typeof message.content !== 'string'
        || (message.name !== undefined && typeof message.name !== 'string')
        || (message.toolCallId !== undefined && typeof message.toolCallId !== 'string')) {
        throw new PageFoldCanonicalError(
            'invalid-transform',
            `Invalid final adapter message at source index ${sourceIndex}`,
        )
    }
    if ((message.images?.length ?? 0) > 0
        || (message.toolCalls?.length ?? 0) > 0
        || (message.reasoning?.length ?? 0) > 0
        || message.providerEcho !== undefined) {
        throw new PageFoldCanonicalError(
            'unsupported-message-metadata',
            `Final adapter message ${sourceIndex} contains image, tool, reasoning, or echo metadata that PageFold 1 cannot encode`,
        )
    }
}

function parseHeader(line: string): PageFoldCanonicalHeader {
    const value = parseObject(line, 'header')
    assertExactKeys(value, HEADER_KEYS, 'header')
    if (value.type !== 'pagefold-transcript'
        || value.version !== PAGEFOLD_SERIALIZER_VERSION
        || !isNonNegativeSafeInteger(value.sourceMessageCount)
        || !isNonNegativeSafeInteger(value.messageCount)
        || value.messageCount > value.sourceMessageCount
        || !TASKS.has(value.task as ResolvedTask)
        || !MODES.has(value.mode as PageFoldMode)) {
        throw invalidDocument('Invalid canonical header')
    }
    return value as unknown as PageFoldCanonicalHeader
}

function parseMessage(line: string): PageFoldCanonicalMessage {
    const value = parseObject(line, 'message')
    assertExactKeys(value, MESSAGE_KEYS, 'message')
    if (value.type !== 'message'
        || !isNonNegativeSafeInteger(value.index)
        || !isNonNegativeSafeInteger(value.sourceIndex)
        || !ROLES.has(value.role as AdapterChatMessage['role'])
        || !(value.name === null || typeof value.name === 'string')
        || !(value.toolCallId === null || typeof value.toolCallId === 'string')
        || typeof value.content !== 'string'
        || !Array.isArray(value.attachments)
        || value.attachments.length !== 0) {
        throw invalidDocument('Invalid canonical message record')
    }
    return value as unknown as PageFoldCanonicalMessage
}

function parseObject(line: string, label: string): Record<string, unknown> {
    let value: unknown
    try {
        value = JSON.parse(line)
    } catch {
        throw invalidDocument(`Canonical ${label} is not valid JSON`)
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw invalidDocument(`Canonical ${label} must be an object`)
    }
    return value as Record<string, unknown>
}

function assertExactKeys(
    value: Record<string, unknown>,
    expected: readonly string[],
    label: string,
): void {
    const keys = Object.keys(value)
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
        throw invalidDocument(`Canonical ${label} properties are missing, extra, or out of order`)
    }
}

function encodeHeader(header: PageFoldCanonicalHeader): string {
    return '{'
        + '"type":"pagefold-transcript"'
        + ',"version":1'
        + ',"sourceMessageCount":' + header.sourceMessageCount
        + ',"messageCount":' + header.messageCount
        + ',"task":' + encodePageFoldJsonString(header.task)
        + ',"mode":' + encodePageFoldJsonString(header.mode)
        + '}'
}

function encodeMessage(message: PageFoldCanonicalMessage): string {
    return '{'
        + '"type":"message"'
        + ',"index":' + message.index
        + ',"sourceIndex":' + message.sourceIndex
        + ',"role":' + encodePageFoldJsonString(message.role)
        + ',"name":' + encodeNullableString(message.name)
        + ',"toolCallId":' + encodeNullableString(message.toolCallId)
        + ',"content":' + encodePageFoldJsonString(message.content)
        + ',"attachments":[]'
        + '}'
}

function encodeNullableString(value: string | null): string {
    return value === null ? 'null' : encodePageFoldJsonString(value)
}

function isNonNegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) return false
    for (let index = 0; index < left.byteLength; index++) {
        if (left[index] !== right[index]) return false
    }
    return true
}

function escapeUtf16Unit(unit: number): string {
    return '\\u' + unit.toString(16).toUpperCase().padStart(4, '0')
}

function mustEscapeCodePoint(codePoint: number): boolean {
    return codePoint === 0x061C
        || codePoint === 0x180E
        || (codePoint >= 0x200B && codePoint <= 0x200F)
        || (codePoint >= 0x2028 && codePoint <= 0x202E)
        || (codePoint >= 0x2060 && codePoint <= 0x206F)
        || (codePoint >= 0xFE00 && codePoint <= 0xFE0F)
        || codePoint === 0xFEFF
        || (codePoint >= 0xFFF9 && codePoint <= 0xFFFB)
        || (codePoint >= 0xE0000 && codePoint <= 0xE007F)
        || (codePoint >= 0xE0100 && codePoint <= 0xE01EF)
}

function invalidDocument(message: string): PageFoldCanonicalError {
    return new PageFoldCanonicalError('invalid-canonical-document', message)
}
