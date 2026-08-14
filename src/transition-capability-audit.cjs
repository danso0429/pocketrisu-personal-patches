'use strict'

const {
    CapabilityContractError,
    jsonSha256,
    validateCapabilityContract,
} = require('./capability-contract.cjs')

const TRANSITION_CAPABILITY_AUDIT_SCHEMA = 'patch-transition-capability-audit-v1'

function capabilityIndex(contract) {
    const result = new Map()
    for (const capability of contract.capabilities) {
        const key = JSON.stringify([
            capability.kind,
            capability.access,
            capability.resource,
        ])
        if (!result.has(key)) result.set(key, [])
        result.get(key).push(capability.id)
    }
    for (const values of result.values()) values.sort()
    return result
}

function transitionActions(transition, contract) {
    if (!transition || !Array.isArray(transition.preconditions) || !Array.isArray(transition.changes)) {
        throw new CapabilityContractError('INVALID_TRANSITION', 'Capability audit requires a complete transition')
    }
    const stateResources = new Set(contract.capabilities
        .filter((capability) => capability.kind === 'state')
        .map((capability) => capability.resource))
    const actions = []
    const add = (phase, kind, access, resource) => actions.push({ phase, kind, access, resource })

    add('precondition', 'target-identity', 'read', 'package.json')
    for (const precondition of transition.preconditions) {
        if (stateResources.has(precondition.path)) {
            add('precondition', 'state', 'read', precondition.path)
        } else {
            add('precondition', 'filesystem', 'read', precondition.path)
            add('precondition', 'metadata', 'read', precondition.path)
            add('precondition', 'topology', 'read', precondition.path)
        }
    }
    for (const change of transition.changes) {
        if (stateResources.has(change.path)) {
            add('transition', 'state', change.after === null ? 'delete' : 'write', change.path)
        } else {
            add('transition', 'filesystem', change.after === null ? 'delete' : 'write', change.path)
            add('transition', 'topology', 'read', change.path)
            if (change.after !== null) add('transition', 'metadata', 'write', change.path)
        }
    }
    for (const resource of [
        'save/pocketrisu-patches/transaction.json',
        'save/pocketrisu-patches/lock.json',
    ]) {
        add('transaction-runtime', 'state', 'read', resource)
        add('transaction-runtime', 'state', 'write', resource)
        add('transaction-runtime', 'state', 'delete', resource)
    }
    add('transaction-runtime', 'process', 'observe', 'patch-manager-process')
    add('transaction-runtime', 'time', 'read', 'transaction-id')
    add('transaction-runtime', 'randomness', 'read', 'transaction-tokens')

    const unique = new Map()
    for (const action of actions) unique.set(JSON.stringify(action), action)
    return [...unique.values()].sort((left, right) =>
        left.phase.localeCompare(right.phase)
        || left.kind.localeCompare(right.kind)
        || left.access.localeCompare(right.access)
        || left.resource.localeCompare(right.resource)
    )
}

function auditTransitionCapabilities(transition, contract) {
    validateCapabilityContract(contract)
    const declared = capabilityIndex(contract)
    const actions = transitionActions(transition, contract).map((action) => {
        const key = JSON.stringify([action.kind, action.access, action.resource])
        return {
            ...action,
            capabilityIds: declared.get(key) ?? [],
        }
    })
    const violations = actions
        .filter((action) => action.capabilityIds.length === 0)
        .map((action) => ({
            kind: 'undeclared-transition-action',
            phase: action.phase,
            capabilityKind: action.kind,
            access: action.access,
            resource: action.resource,
        }))
    if (violations.length > 0) {
        throw new CapabilityContractError(
            'UNDECLARED_TRANSITION_ACTION',
            `Transition requires ${violations.length} undeclared action(s)`,
            { violations },
        )
    }
    const transitionShape = {
        target: transition.target ?? null,
        resolution: transition.resolution ?? null,
        preconditions: transition.preconditions,
        changes: transition.changes,
    }
    const payload = {
        schema: TRANSITION_CAPABILITY_AUDIT_SCHEMA,
        status: 'pass',
        contractSha256: contract.contractSha256,
        transitionSha256: jsonSha256(transitionShape),
        actions,
        violations: [],
        mutationPerformed: false,
    }
    return {
        ...payload,
        auditSha256: jsonSha256(payload),
    }
}

module.exports = {
    TRANSITION_CAPABILITY_AUDIT_SCHEMA,
    auditTransitionCapabilities,
    transitionActions,
}
