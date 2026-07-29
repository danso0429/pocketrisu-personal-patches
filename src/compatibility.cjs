'use strict'

const fs = require('node:fs')
const path = require('node:path')

class PatchCompatibilityError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'PatchCompatibilityError'
        this.code = code
        this.details = details
    }
}

function readTarget(root) {
    const packagePath = path.join(root, 'package.json')
    let pkg
    try {
        pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    } catch (error) {
        throw new PatchCompatibilityError(
            'INVALID_TARGET',
            `Could not read target package metadata under ${root}`,
            { cause: error.message },
        )
    }
    return {
        packageName: typeof pkg.name === 'string' ? pkg.name : null,
        packageVersion: typeof pkg.version === 'string' ? pkg.version : null,
    }
}

function evaluateTargetCompatibility(root, packs) {
    const target = readTarget(root)
    if (packs.length === 0) {
        return {
            status: 'verified',
            target,
            verifiedPacks: [],
            underReviewPacks: [],
            reviewRequiredPacks: [],
        }
    }
    const verifiedPacks = []
    const underReviewPacks = []
    const reviewRequiredPacks = []
    for (const pack of packs) {
        const verified = pack.targets?.[target.packageName]?.verified ?? []
        const reviewing = pack.targets?.[target.packageName]?.reviewing ?? []
        const entry = {
            id: pack.id,
            version: pack.version,
            verifiedVersions: [...verified],
            reviewingVersions: [...reviewing],
        }
        if (verified.includes(target.packageVersion)) verifiedPacks.push(entry)
        else if (reviewing.includes(target.packageVersion)) underReviewPacks.push(entry)
        else reviewRequiredPacks.push(entry)
    }
    return {
        status: reviewRequiredPacks.length > 0
            ? 'review-required'
            : (underReviewPacks.length > 0 ? 'under-review' : 'verified'),
        target,
        verifiedPacks,
        underReviewPacks,
        reviewRequiredPacks,
    }
}

function assertTargetVerified(compatibility) {
    if (compatibility.status === 'verified') return
    const target = compatibility.target
    throw new PatchCompatibilityError(
        'TARGET_REVIEW_REQUIRED',
        `${target.packageName ?? 'unknown target'} ${target.packageVersion ?? 'unknown version'} `
        + 'has not been qualified for every selected patch pack',
        {
            target,
            packs: [
                ...compatibility.underReviewPacks,
                ...compatibility.reviewRequiredPacks,
            ].map((pack) => pack.id),
            qualification: compatibility,
        },
    )
}

function assertTargetReviewable(compatibility) {
    if (
        compatibility.status === 'verified'
        || (
            compatibility.status === 'under-review'
            && compatibility.reviewRequiredPacks.length === 0
        )
    ) return
    const target = compatibility.target
    throw new PatchCompatibilityError(
        'TARGET_REVIEW_REQUIRED',
        `${target.packageName ?? 'unknown target'} ${target.packageVersion ?? 'unknown version'} `
        + 'is not declared as a maintainer review target for every selected patch pack',
        {
            target,
            packs: compatibility.reviewRequiredPacks.map((pack) => pack.id),
            qualification: compatibility,
        },
    )
}

module.exports = {
    PatchCompatibilityError,
    assertTargetReviewable,
    assertTargetVerified,
    evaluateTargetCompatibility,
    readTarget,
}
