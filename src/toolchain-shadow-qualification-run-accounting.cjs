'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { canonicalJson } = require('./verification-receipts.cjs')

const ACCOUNTING_SCHEMA = 'patch-toolchain-shadow-qualification-run-accounting-v1'
const EXECUTION_STATE_SCHEMA = 'patch-toolchain-shadow-qualification-execution-state-v1'
const KNOWLEDGE = Object.freeze(['known', 'unknown'])

class ToolchainShadowQualificationAccountingError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'ToolchainShadowQualificationAccountingError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new ToolchainShadowQualificationAccountingError(code, message, details)
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
        fail('INVALID_QUALIFICATION_RUN_ACCOUNTING', `${label} fields differ`)
    }
}

function known(value, source) {
    if (!Number.isSafeInteger(value) || value < 0 || typeof source !== 'string' || source.length === 0) {
        fail('INVALID_QUALIFICATION_RUN_ACCOUNTING', 'Known execution count is invalid')
    }
    return { knowledge: 'known', value, source }
}

function unknown() {
    return { knowledge: 'unknown', value: null, source: 'no-retained-execution-evidence' }
}

function validateCount(count, label) {
    exactKeys(count, ['knowledge', 'value', 'source'], label)
    if (!KNOWLEDGE.includes(count.knowledge)
        || (count.knowledge === 'known' && (!Number.isSafeInteger(count.value) || count.value < 0))
        || (count.knowledge === 'unknown' && count.value !== null)
        || typeof count.source !== 'string' || count.source.length === 0) {
        fail('INVALID_QUALIFICATION_RUN_ACCOUNTING', `${label} is invalid`)
    }
    return count
}

function validateExecutionState(state) {
    exactKeys(state, ['schema', 'status', 'phase', 'local', 'global', 'failure'], 'qualification execution state')
    if (state.schema !== EXECUTION_STATE_SCHEMA
        || !['running', 'passed', 'failed'].includes(state.status)
        || typeof state.phase !== 'string' || state.phase.length === 0) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Qualification execution state identity differs')
    }
    exactKeys(state.local, ['launches', 'casesCompleted', 'receiptRetained'], 'local execution state')
    exactKeys(state.global, ['launches', 'masksCompleted', 'receiptRetained'], 'Global execution state')
    for (const [label, launches] of [
        ['local', state.local.launches], ['Global', state.global.launches],
    ]) if (![0, 1].includes(launches)) fail('INVALID_QUALIFICATION_EXECUTION_STATE', `${label} launches differ`)
    for (const [label, value] of [
        ['local cases', state.local.casesCompleted], ['Global masks', state.global.masksCompleted],
    ]) if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', `${label} differs`)
    }
    if (typeof state.local.receiptRetained !== 'boolean'
        || typeof state.global.receiptRetained !== 'boolean'
        || (state.failure !== null && (typeof state.failure?.code !== 'string'
            || typeof state.failure?.message !== 'string'))) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Qualification execution retention state differs')
    }
    return state
}

function receiptCount(receipt, kind) {
    if (receipt === null) return null
    if (!receipt || typeof receipt !== 'object') {
        fail('INVALID_RETAINED_QUALIFICATION_RECEIPT', `${kind} receipt is malformed`)
    }
    if (kind === 'local') {
        const value = receipt.coverage?.processedExecutions
        if (!Number.isSafeInteger(value) || value < 0) {
            fail('INVALID_RETAINED_QUALIFICATION_RECEIPT', 'Local receipt coverage is malformed')
        }
        return value
    }
    const value = receipt.verifierResult?.verifiedSelections
    if (!Number.isSafeInteger(value) || value < 0) {
        fail('INVALID_RETAINED_QUALIFICATION_RECEIPT', 'Global receipt coverage is malformed')
    }
    return value
}

function buildQualificationRunAccounting({
    status,
    executionState = null,
    localReceipt = null,
    globalReceipt = null,
    successReport = null,
}) {
    if (!['passed', 'failed'].includes(status)) {
        fail('INVALID_QUALIFICATION_RUN_ACCOUNTING', 'Final qualification status is invalid')
    }
    const state = executionState === null ? null : validateExecutionState(executionState)
    const localCases = receiptCount(localReceipt, 'local')
    const globalMasks = receiptCount(globalReceipt, 'global')
    if (state !== null && ((localReceipt !== null && state.local.launches !== 1)
        || (globalReceipt !== null && state.global.launches !== 1)
        || (localCases !== null && state.local.casesCompleted !== null
            && state.local.casesCompleted !== localCases)
        || (globalMasks !== null && state.global.masksCompleted !== null
            && state.global.masksCompleted !== globalMasks))) {
        fail('QUALIFICATION_ACCOUNTING_CONTRADICTION', 'Retained receipts contradict execution state')
    }
    const reportPresent = successReport !== null
    const accounting = {
        schema: ACCOUNTING_SCHEMA,
        status,
        localLaunches: localReceipt !== null
            ? known(1, 'retained-local-receipt')
            : (state === null ? unknown() : known(state.local.launches, 'retained-execution-state')),
        localCasesCompleted: localCases !== null
            ? known(localCases, 'retained-local-receipt')
            : (state?.local.casesCompleted === null || state === null
                ? unknown()
                : known(state.local.casesCompleted, 'retained-execution-state')),
        globalLaunches: globalReceipt !== null
            ? known(1, 'retained-global-receipt')
            : (state === null ? unknown() : known(state.global.launches, 'retained-execution-state')),
        globalMasksCompleted: globalMasks !== null
            ? known(globalMasks, 'retained-global-receipt')
            : (state?.global.masksCompleted === null || state === null
                ? unknown()
                : known(state.global.masksCompleted, 'retained-execution-state')),
        successReportPresent: reportPresent,
        successReportUsedAsSoleCountSource: false,
    }
    return validateQualificationRunAccounting(accounting)
}

function validateQualificationRunAccounting(accounting) {
    exactKeys(accounting, [
        'schema', 'status', 'localLaunches', 'localCasesCompleted', 'globalLaunches',
        'globalMasksCompleted', 'successReportPresent', 'successReportUsedAsSoleCountSource',
    ], 'qualification run accounting')
    if (accounting.schema !== ACCOUNTING_SCHEMA || !['passed', 'failed'].includes(accounting.status)
        || typeof accounting.successReportPresent !== 'boolean'
        || accounting.successReportUsedAsSoleCountSource !== false) {
        fail('INVALID_QUALIFICATION_RUN_ACCOUNTING', 'Qualification run accounting identity differs')
    }
    for (const key of [
        'localLaunches', 'localCasesCompleted', 'globalLaunches', 'globalMasksCompleted',
    ]) validateCount(accounting[key], key)
    return accounting
}

function readJsonIfPresent(file) {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function accountingFromOutputDirectory(outputDirectory, { status, successReport = null } = {}) {
    const root = path.resolve(outputDirectory)
    return buildQualificationRunAccounting({
        status,
        executionState: readJsonIfPresent(path.join(root, 'execution-state.json')),
        localReceipt: readJsonIfPresent(path.join(root, 'local-receipt.json')),
        globalReceipt: readJsonIfPresent(path.join(root, 'global-receipt.json')),
        successReport,
    })
}

module.exports = {
    ACCOUNTING_SCHEMA,
    EXECUTION_STATE_SCHEMA,
    ToolchainShadowQualificationAccountingError,
    accountingFromOutputDirectory,
    buildQualificationRunAccounting,
    validateExecutionState,
    validateQualificationRunAccounting,
}
