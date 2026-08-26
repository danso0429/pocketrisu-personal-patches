'use strict'

const {
    QualityCostProtocolError,
    assertAllowedRequestDiff,
    buildCoreConditionMatrix,
    canonicalJson,
    sha256Json,
} = require('./protocol-v1.cjs')

const RESOLUTION_ENUMS = Object.freeze({
    low: 'MEDIA_RESOLUTION_LOW',
    medium: 'MEDIA_RESOLUTION_MEDIUM',
    high: 'MEDIA_RESOLUTION_HIGH',
})

function fail(code) {
    throw new QualityCostProtocolError(code)
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value))
}

function collectResolutionAuthorities(value, path = '', out = []) {
    if (Array.isArray(value)) {
        value.forEach((child, index) => collectResolutionAuthorities(child, `${path}/${index}`, out))
        return out
    }
    if (!value || typeof value !== 'object') return out
    for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}/${key}`
        if (key === 'mediaResolution') out.push({ path: childPath, value: child })
        collectResolutionAuthorities(child, childPath, out)
    }
    return out
}

function locateProductionResolution(body) {
    const authorities = collectResolutionAuthorities(body)
    if (authorities.length !== 1) fail('REQUEST_RESOLUTION_AUTHORITY_COUNT_INVALID')
    const authority = authorities[0]
    if (authority.value === 'MEDIA_RESOLUTION_LOW') {
        return { path: authority.path, shape: 'scalar-generation', valuePath: authority.path }
    }
    if (authority.value && typeof authority.value === 'object' && !Array.isArray(authority.value)
        && Object.keys(authority.value).length === 1
        && authority.value.level === 'MEDIA_RESOLUTION_LOW') {
        return { path: authority.path, shape: 'part-level', valuePath: `${authority.path}/level` }
    }
    fail('REQUEST_PRODUCTION_RESOLUTION_NOT_LOW')
}

function setJsonPointer(root, pointer, value) {
    const parts = pointer.split('/').slice(1).map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    if (parts.length === 0) fail('REQUEST_POINTER_INVALID')
    let current = root
    for (let index = 0; index < parts.length - 1; index++) {
        const key = Array.isArray(current) ? Number(parts[index]) : parts[index]
        if (current?.[key] === undefined) fail('REQUEST_POINTER_MISSING')
        current = current[key]
    }
    const last = Array.isArray(current) ? Number(parts.at(-1)) : parts.at(-1)
    if (current?.[last] === undefined) fail('REQUEST_POINTER_MISSING')
    current[last] = value
}

function deriveResolutionVariant(productionLowBody, resolution) {
    if (!Object.hasOwn(RESOLUTION_ENUMS, resolution)) fail('REQUEST_RESOLUTION_INVALID')
    const authority = locateProductionResolution(productionLowBody)
    if (resolution === 'low') {
        return Object.freeze({
            resolution,
            body: cloneJson(productionLowBody),
            diff: Object.freeze({
                baseSha256: sha256Json(productionLowBody),
                variantSha256: sha256Json(productionLowBody),
                paths: Object.freeze([]),
            }),
            resolutionAuthority: authority,
        })
    }
    const variant = cloneJson(productionLowBody)
    setJsonPointer(variant, authority.valuePath, RESOLUTION_ENUMS[resolution])
    const diff = assertAllowedRequestDiff(productionLowBody, variant, [authority.valuePath])
    return Object.freeze({
        resolution,
        body: variant,
        diff,
        resolutionAuthority: authority,
    })
}

function validateEffectiveMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) fail('REQUEST_EFFECTIVE_MESSAGES_INVALID')
    return messages.map((message, sourceIndex) => {
        if (!message || !['system', 'user', 'assistant', 'tool'].includes(message.role)
            || typeof message.content !== 'string') fail('REQUEST_EFFECTIVE_MESSAGE_INVALID')
        return { ...message, sourceIndex: Number.isSafeInteger(message.sourceIndex) ? message.sourceIndex : sourceIndex }
    })
}

function validateCapturedMessageParity(snapshot) {
    if (!Array.isArray(snapshot?.formattedMessages) || !Array.isArray(snapshot?.effectiveMessages)
        || snapshot.formattedMessages.length !== snapshot.effectiveMessages.length
        || snapshot.formattedMessages.length === 0) fail('REQUEST_CAPTURED_MESSAGE_PARITY_INVALID')
    for (let index = 0; index < snapshot.formattedMessages.length; index++) {
        const formatted = snapshot.formattedMessages[index]
        const effective = snapshot.effectiveMessages[index]
        if (formatted.sourceIndex !== index || effective.sourceIndex !== index
            || formatted.role !== effective.role || formatted.content !== effective.content
            || (formatted.name ?? null) !== (effective.name ?? null)
            || Boolean(formatted.cachePoint) !== Boolean(effective.cachePoint)) {
            fail('REQUEST_CAPTURED_MESSAGE_PARITY_INVALID')
        }
    }
    const rawUserMessages = snapshot.sources.filter((source) => (
        source.kind === 'raw-chat-message' && source.role === 'user'
    ))
    if (rawUserMessages.length === 0) fail('REQUEST_RAW_CURRENT_USER_MISSING')
    const rawCurrent = rawUserMessages.at(-1)
    if (typeof rawCurrent.nativeMessageId !== 'string' || rawCurrent.nativeMessageId.length === 0) {
        fail('REQUEST_RAW_CURRENT_USER_ID_INVALID')
    }
    const matches = snapshot.formattedMessages.filter((message) => message.nativeMessageId === rawCurrent.nativeMessageId)
    if (matches.length !== 1 || matches[0].role !== 'user') fail('REQUEST_CURRENT_USER_MAPPING_INVALID')
    return Object.freeze({
        rawSourceId: rawCurrent.id,
        nativeMessageId: rawCurrent.nativeMessageId,
        effectiveSourceIndex: matches[0].sourceIndex,
    })
}

function partitionConditionMessages(messages, condition) {
    const effective = validateEffectiveMessages(messages)
    if (condition?.carrier === 'direct-text') {
        return Object.freeze({
            carrier: 'direct-text',
            pdfMessages: Object.freeze([]),
            nativeSystemMessages: Object.freeze([]),
            nativeCurrentUserMessage: null,
            directMessages: Object.freeze(effective),
        })
    }
    if (condition?.carrier !== 'pdf'
        || !['pdf', 'native'].includes(condition.systemPlacement)
        || !['pdf', 'native'].includes(condition.currentUserPlacement)
        || !Object.hasOwn(RESOLUTION_ENUMS, condition.mediaResolution)) fail('REQUEST_CONDITION_INVALID')
    let currentUserIndex = -1
    for (let index = effective.length - 1; index >= 0; index--) {
        if (effective[index].role === 'user') {
            currentUserIndex = index
            break
        }
    }
    if (currentUserIndex < 0) fail('REQUEST_CURRENT_USER_MISSING')
    const nativeSystemMessages = []
    let nativeCurrentUserMessage = null
    const pdfMessages = []
    effective.forEach((message, index) => {
        if (message.role === 'system' && condition.systemPlacement === 'native') {
            nativeSystemMessages.push(message)
            return
        }
        if (index === currentUserIndex && condition.currentUserPlacement === 'native') {
            nativeCurrentUserMessage = message
            return
        }
        pdfMessages.push(message)
    })
    if (pdfMessages.length === 0) fail('REQUEST_PDF_MESSAGES_EMPTY')
    return Object.freeze({
        carrier: 'pdf',
        pdfMessages: Object.freeze(pdfMessages),
        nativeSystemMessages: Object.freeze(nativeSystemMessages),
        nativeCurrentUserMessage,
        directMessages: Object.freeze([]),
    })
}

function conditionFactorDifferences(left, right) {
    const factors = ['carrier', 'mediaResolution', 'systemPlacement', 'currentUserPlacement']
    return factors.filter((factor) => left[factor] !== right[factor])
}

function buildCoreFactorPairs(conditions = buildCoreConditionMatrix()) {
    const pdf = conditions.filter((condition) => condition.carrier === 'pdf')
    const pairs = []
    for (let leftIndex = 0; leftIndex < pdf.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < pdf.length; rightIndex++) {
            const differences = conditionFactorDifferences(pdf[leftIndex], pdf[rightIndex])
            if (differences.length !== 1) continue
            pairs.push(Object.freeze({
                factor: differences[0],
                leftKey: pdf[leftIndex].key,
                rightKey: pdf[rightIndex].key,
            }))
        }
    }
    return Object.freeze(pairs)
}

function buildPartitionReceipt(messages, condition) {
    const partition = partitionConditionMessages(messages, condition)
    const contentFree = {
        conditionKey: condition.key,
        carrier: partition.carrier,
        pdfSourceIndices: partition.pdfMessages.map((message) => message.sourceIndex),
        nativeSystemSourceIndices: partition.nativeSystemMessages.map((message) => message.sourceIndex),
        nativeCurrentUserSourceIndex: partition.nativeCurrentUserMessage?.sourceIndex ?? null,
        directSourceIndices: partition.directMessages.map((message) => message.sourceIndex),
        sourceIdentitySha256: sha256Json(messages),
    }
    return Object.freeze({ ...contentFree, receiptSha256: sha256Json(contentFree) })
}

function assertSameSourcePartitionCoverage(messages, receipt) {
    const expected = validateEffectiveMessages(messages).map((message) => message.sourceIndex).sort((a, b) => a - b)
    const observed = [
        ...receipt.pdfSourceIndices,
        ...receipt.nativeSystemSourceIndices,
        ...(receipt.nativeCurrentUserSourceIndex === null ? [] : [receipt.nativeCurrentUserSourceIndex]),
        ...receipt.directSourceIndices,
    ].sort((a, b) => a - b)
    if (canonicalJson(observed) !== canonicalJson(expected)) fail('REQUEST_PARTITION_COVERAGE_INVALID')
    if (new Set(observed).size !== observed.length) fail('REQUEST_PARTITION_DUPLICATE_SOURCE')
    return true
}

module.exports = {
    RESOLUTION_ENUMS,
    assertSameSourcePartitionCoverage,
    buildCoreFactorPairs,
    buildPartitionReceipt,
    collectResolutionAuthorities,
    conditionFactorDifferences,
    deriveResolutionVariant,
    locateProductionResolution,
    partitionConditionMessages,
    setJsonPointer,
    validateCapturedMessageParity,
    validateEffectiveMessages,
}
