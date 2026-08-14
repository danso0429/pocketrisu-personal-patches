'use strict'

const { jsonSha256, validateCapabilityContract } = require('./capability-contract.cjs')
const { validateFreshShadowReceipt } = require('./fresh-shadow-verifier.cjs')

const COMPOSITIONAL_THEOREM_RECEIPT_SCHEMA = 'patch-compositional-theorem-receipt-v1'
const REQUIRED_PREMISES = Object.freeze([
    'apply-revert-composition',
    'boundary-class-completeness',
    'complete-declared-and-observed-effects',
    'component-join-split-rules',
    'deterministic-resolver-decomposition',
    'ownership-and-ordering',
    'preconditions',
    'selection-file-region-state-symbol-boundaries',
    'status-composition',
    'unknown-premise-fallback',
    'worker-history-isolation',
])

class CompositionalTheoremError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'CompositionalTheoremError'
        this.code = code
        this.details = details
    }
}

function validateGraph(graph, contract) {
    if (!graph || graph.schema !== 'patch-action-hypergraph-v1') {
        throw new CompositionalTheoremError('INVALID_THEOREM_GRAPH', 'The theorem graph schema is invalid')
    }
    const { graphSha256, ...payload } = graph
    if (graphSha256 !== jsonSha256(payload) || graph.contractSha256 !== contract.contractSha256) {
        throw new CompositionalTheoremError('THEOREM_GRAPH_HASH_MISMATCH', 'The theorem graph is stale or corrupt')
    }
}

function validatePremises(premises) {
    if (!Array.isArray(premises)) {
        throw new CompositionalTheoremError('INVALID_THEOREM_PREMISES', 'Theorem premises must be an array')
    }
    const ids = premises.map((premise) => premise.id).sort()
    if (JSON.stringify(ids) !== JSON.stringify(REQUIRED_PREMISES)) {
        throw new CompositionalTheoremError('INCOMPLETE_THEOREM_PREMISES', 'The theorem premise set is not exact', {
            required: REQUIRED_PREMISES,
            actual: ids,
        })
    }
    for (const premise of premises) {
        if (
            !['verified', 'unverified'].includes(premise.status)
            || typeof premise.sourceRepresentation !== 'string'
            || premise.sourceRepresentation.length === 0
            || typeof premise.runtimeEnforcement !== 'string'
            || premise.runtimeEnforcement.length === 0
            || typeof premise.independentValidator !== 'string'
            || premise.independentValidator.length === 0
            || !['broader-component', 'global-fallback', 'admission-rejection'].includes(premise.failureAction)
            || (premise.status === 'verified' && !/^[0-9a-f]{64}$/.test(premise.evidenceSha256 ?? ''))
            || (premise.status === 'unverified' && premise.evidenceSha256 !== null)
        ) {
            throw new CompositionalTheoremError('INVALID_THEOREM_PREMISE', `Invalid theorem premise ${premise.id}`)
        }
    }
}

function validateBoundaryCoverage(contract, graph, boundaryCoverage, shadowReceipts) {
    if (!Array.isArray(boundaryCoverage)) {
        throw new CompositionalTheoremError('INVALID_BOUNDARY_COVERAGE', 'Boundary coverage must be an array')
    }
    const expected = contract.boundaries.flatMap((boundary) =>
        boundary.inputClasses.map((inputClass) => `${boundary.id}:${inputClass}`)
    ).sort()
    const actual = boundaryCoverage.map((entry) => `${entry.boundaryId}:${entry.inputClass}`).sort()
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new CompositionalTheoremError('INCOMPLETE_TYPED_BOUNDARY_COVERAGE', 'Typed boundary classes are incomplete', {
            expected,
            actual,
        })
    }
    const receiptsByComponent = new Map(shadowReceipts.map((receipt) => [receipt.component.id, receipt]))
    for (const coverage of boundaryCoverage) {
        if (!Array.isArray(coverage.classIds) || coverage.classIds.length === 0) {
            throw new CompositionalTheoremError('EMPTY_TYPED_BOUNDARY_CLASS', 'A typed boundary class has no concrete classes')
        }
        const boundary = contract.boundaries.find((entry) => entry.id === coverage.boundaryId)
        const participants = new Set([...boundary.providers, ...boundary.consumers])
        for (const component of graph.components.filter((entry) =>
            entry.packIds.some((packId) => participants.has(packId))
        )) {
            const receipt = receiptsByComponent.get(component.id)
            const receiptClasses = new Set(receipt?.boundaryClasses.map((entry) => entry.id) ?? [])
            if (!coverage.classIds.every((id) => receiptClasses.has(id))) {
                throw new CompositionalTheoremError(
                    'BOUNDARY_CLASS_NOT_EXECUTED',
                    `Component ${component.id} did not execute every class for ${coverage.boundaryId}`,
                )
            }
        }
    }
}

function seal(payload) {
    return { ...payload, receiptSha256: jsonSha256(payload) }
}

function basePayload(contract, graph, premises, boundaryCoverage, shadowReceipts) {
    return {
        schema: COMPOSITIONAL_THEOREM_RECEIPT_SCHEMA,
        contractSha256: contract.contractSha256,
        graphSha256: graph.graphSha256,
        premises: premises.map((premise) => ({ ...premise })),
        boundaryCoverage: boundaryCoverage.map((entry) => ({
            ...entry,
            classIds: [...entry.classIds],
        })),
        shadowReceiptHashes: shadowReceipts.map((receipt) => receipt.receiptSha256).sort(),
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            fallbackRetained: true,
            certificatesIssued: 0,
            canonicalMasksSkipped: 0,
            productionStateWritten: false,
            defaultChanged: false,
        },
    }
}

function verifyCompositionalAdmission({ contract, graph, premises, boundaryCoverage, shadowReceipts }) {
    validateCapabilityContract(contract)
    validateGraph(graph, contract)
    validatePremises(premises)
    if (!Array.isArray(shadowReceipts)) {
        throw new CompositionalTheoremError('INVALID_SHADOW_RECEIPTS', 'Shadow receipts must be an array')
    }
    for (const receipt of shadowReceipts) validateFreshShadowReceipt(receipt)
    const common = basePayload(contract, graph, premises, boundaryCoverage, shadowReceipts)
    if (graph.fallback.required) {
        return seal({ ...common, status: 'fallback', outcome: 'global-fallback' })
    }
    if (premises.some((premise) => premise.status !== 'verified')) {
        return seal({ ...common, status: 'rejected', outcome: 'admission-rejected' })
    }
    const receiptsByComponent = new Map(shadowReceipts.map((receipt) => [receipt.component.id, receipt]))
    if (
        shadowReceipts.length !== graph.components.length
        || graph.components.some((component) => {
            const receipt = receiptsByComponent.get(component.id)
            return receipt?.status !== 'passed'
                || JSON.stringify(receipt.component.packIds) !== JSON.stringify(component.packIds)
        })
    ) {
        return seal({ ...common, status: 'rejected', outcome: 'admission-rejected' })
    }
    validateBoundaryCoverage(contract, graph, boundaryCoverage, shadowReceipts)
    return seal({ ...common, status: 'passed', outcome: 'component-admitted' })
}

function validateCompositionalTheoremReceipt(receipt) {
    if (!receipt || receipt.schema !== COMPOSITIONAL_THEOREM_RECEIPT_SCHEMA) {
        throw new CompositionalTheoremError('INVALID_THEOREM_RECEIPT', 'Theorem receipt schema is invalid')
    }
    const { receiptSha256, ...payload } = receipt
    if (receiptSha256 !== jsonSha256(payload)) {
        throw new CompositionalTheoremError('THEOREM_RECEIPT_HASH_MISMATCH', 'Theorem receipt hash does not match')
    }
    if (receipt.status === 'passed' && receipt.outcome !== 'component-admitted') {
        throw new CompositionalTheoremError('INVALID_THEOREM_OUTCOME', 'A passed theorem must admit a component')
    }
    if (receipt.status !== 'passed' && receipt.outcome === 'component-admitted') {
        throw new CompositionalTheoremError('INVALID_THEOREM_OUTCOME', 'An incomplete theorem cannot admit a component')
    }
    validatePremises(receipt.premises)
    return receipt
}

module.exports = {
    COMPOSITIONAL_THEOREM_RECEIPT_SCHEMA,
    CompositionalTheoremError,
    REQUIRED_PREMISES,
    validateCompositionalTheoremReceipt,
    verifyCompositionalAdmission,
}
