import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

const {
    MAX_CALLS,
    MAX_OUTPUT_CONTROLS,
    buildVertexRequestBody,
    runStructuralPaid,
} = require('./pageFoldStructuralPaidRunner.cjs')
const {
    createHierarchyPlan,
    createQualificationPlan,
    createScreeningPlan,
    expectedForClaim,
} = require('./pageFoldStructuralRequalification.cjs')

const CREDENTIAL_SECRET = 'fixture-credential-secret-value'
const TOKEN_SECRET = 'fixture-token-secret-value'

function fixtures() {
    return Object.fromEntries([
        fixture('maximum', 1, 1_000, '1'),
        fixture('maximum', 2, 1_428, '2'),
        fixture('maximum', 8, 9_996, '8'),
        fixture('balanced', 2, 1_428, 'b'),
    ].map((entry) => [`${entry.mode}:${entry.pages}`, entry]))
}

function fixture(mode: string, pages: number, messageCount: number, hashSeed: string) {
    const pdf = Buffer.from(`fixture-pdf:${mode}:${pages}`)
    return {
        mode,
        pages,
        messageCount,
        sourceBytes: 1_000 * pages,
        pdf,
        pdfBytes: pdf.length,
        pdfSha256: crypto.createHash('sha256').update(hashSeed).digest('hex'),
        extractionExact: true,
        markerTriples: Array.from({ length: pages }, (_, index) => [
            `L${String(index * 3).padStart(6, '0')}`,
            `L${String(index * 3 + 1).padStart(6, '0')}`,
            `L${String(index * 3 + 2).padStart(6, '0')}`,
        ]),
        retainedSystem: mode === 'balanced'
            ? 'L000000|SYSTEM_AUTHORITY_41D7\n\nL000004|ROLE:R_SYS'
            : '',
    }
}

function credentials() {
    return {
        vertexServiceAccount: { type: 'service_account' },
        vertexProjectId: 'fixture-project',
        checks: {
            vertexEntryUnique: true,
            vertexServiceAccountShape: true,
            vertexProjectIdPresent: true,
            vertexPrivateKeyPresent: true,
            vertexTokenUriAllowlisted: true,
        },
        secrets: [CREDENTIAL_SECRET],
    }
}

function passResult(cell: any, fixtureValue: any, extras: Record<string, any> = {}) {
    return {
        httpStatus: 200,
        latencyMs: 10,
        finishReason: 'STOP',
        usage: {
            promptTokens: cell.transport === 'text' ? 100 : 100 * cell.pages,
            outputTokens: 50,
            candidateTokens: 50,
            thoughtTokens: 0,
            totalTokens: (cell.transport === 'text' ? 100 : 100 * cell.pages) + 50,
        },
        answer: {
            ...expectedForClaim(cell.claim, fixtureValue || {}),
            unknown: CREDENTIAL_SECRET,
        },
        ...extras,
    }
}

function baseOptions(executeCell: (args: any) => Promise<any>) {
    return {
        executionApproved: true,
        fixtures: fixtures(),
        credentials: credentials(),
        getToken: async () => ({
            accessToken: TOKEN_SECRET,
            refreshAt: Date.now() + 60_000,
        }),
        executeCell,
        onCheckpoint: async () => {},
    }
}

describe('PageFold structural paid runner', () => {
    it('is separately paid-gated before fixtures, credentials, or calls', async () => {
        let touched = false
        await expect(runStructuralPaid({
            createFixtures: async () => { touched = true; return fixtures() },
        })).rejects.toMatchObject({ code: 'PAID_EXECUTION_NOT_ENABLED' })
        expect(touched).toBe(false)
    })

    it('requires durable checkpoint ownership before fixtures or paid calls', async () => {
        let touched = false
        await expect(runStructuralPaid({
            executionApproved: true,
            createFixtures: async () => { touched = true; return fixtures() },
        })).rejects.toMatchObject({ code: 'CHECKPOINT_REQUIRED' })
        expect(touched).toBe(false)
    })

    it('does not start a provider call when its durable start checkpoint fails', async () => {
        let calls = 0
        const options = baseOptions(async ({ cell, fixture: fixtureValue }: any) => {
            calls++
            return passResult(cell, fixtureValue)
        })
        options.onCheckpoint = async () => { throw new Error('fixture-checkpoint-failure') }
        await expect(runStructuralPaid(options)).rejects.toThrow('fixture-checkpoint-failure')
        expect(calls).toBe(0)
    })

    it('does not start a second provider call when completion checkpointing fails', async () => {
        let calls = 0
        let checkpoints = 0
        const options = baseOptions(async ({ cell, fixture: fixtureValue }: any) => {
            calls++
            return passResult(cell, fixtureValue)
        })
        options.onCheckpoint = async () => {
            checkpoints++
            if (checkpoints === 2) throw new Error('fixture-checkpoint-failure')
        }
        await expect(runStructuralPaid(options)).rejects.toThrow('fixture-checkpoint-failure')
        expect(calls).toBe(1)
    })

    it('stops after the one text call when the response oracle fails', async () => {
        const executeCell = async ({ cell, fixture: fixtureValue }: any) => {
            const result = passResult(cell, fixtureValue)
            result.answer.words = ['WRONG']
            return result
        }
        const summary = await runStructuralPaid(baseOptions(executeCell))
        expect(summary).toMatchObject({
            complete: false,
            stage: 'L1',
            stopReason: 'text-oracle-not-passed',
            completedCalls: 1,
        })
        expect(summary.records).toHaveLength(1)
        expect(summary.records[0].differences).toEqual([
            expect.objectContaining({ field: 'words', kind: 'mismatch' }),
        ])
    })

    it('pauses after five calls when both one-page resolutions pass', async () => {
        const executeCell = async ({ cell, fixture: fixtureValue }: any) =>
            passResult(cell, fixtureValue)
        const summary = await runStructuralPaid(baseOptions(executeCell))
        expect(summary).toMatchObject({
            complete: false,
            stage: 'decision-required',
            stopReason: 'both-resolutions-passed',
            selectedResolution: null,
            completedCalls: 5,
            decision: {
                status: 'decision-required',
                candidates: ['low', 'medium'],
            },
        })
        expect(summary.records.some((record: any) => record.cell.stage === 'L3')).toBe(false)
        expect(summary.resolutionScreening).toEqual([
            expect.objectContaining({ resolution: 'low', byteStructure: 'pass', grammarRole: 'pass' }),
            expect.objectContaining({ resolution: 'medium', byteStructure: 'pass', grammarRole: 'pass' }),
        ])
    })

    it('selects the only passing resolution and closes the 21-call matrix', async () => {
        const executeCell = async ({ cell, fixture: fixtureValue }: any) => {
            const result = passResult(cell, fixtureValue)
            if (cell.stage === 'L2' && cell.resolution === 'medium' && cell.claim === 'byte-structure') {
                result.answer.samples[0].spaceRuns = [0]
            }
            return result
        }
        const summary = await runStructuralPaid(baseOptions(executeCell))
        expect(summary).toMatchObject({
            complete: true,
            supportQualified: true,
            stage: 'complete',
            stopReason: null,
            selectedResolution: 'low',
            completedCalls: 21,
            ratedCostUsd: expect.any(Number),
        })
        expect(summary.records.filter((record: any) => record.cell.stage === 'L3')).toHaveLength(13)
        expect(summary.records.filter((record: any) => record.cell.stage === 'L4')).toHaveLength(3)
        expect(createScreeningPlan()).toHaveLength(5)
        expect(createQualificationPlan('low')).toHaveLength(13)
        expect(createHierarchyPlan('low')).toHaveLength(3)
    })

    it('uses one 1024 control for MAX_TOKENS and never controls that cell again', async () => {
        const executeCell = async ({ cell, fixture: fixtureValue }: any) => {
            if (cell.claim === 'text-oracle' && cell.outputTokens === 512) {
                return passResult(cell, fixtureValue, {
                    finishReason: 'MAX_TOKENS',
                    answer: null,
                    usage: {
                        promptTokens: 100,
                        outputTokens: 500,
                        candidateTokens: 500,
                        thoughtTokens: 0,
                        totalTokens: 600,
                    },
                })
            }
            return passResult(cell, fixtureValue)
        }
        const summary = await runStructuralPaid(baseOptions(executeCell))
        expect(summary).toMatchObject({
            stage: 'decision-required',
            completedCalls: 6,
            outputControlsUsed: 1,
        })
        expect(summary.records.slice(0, 2).map((record: any) => ({
            outputTokens: record.cell.outputTokens,
            control: record.control,
            status: record.status,
        }))).toEqual([
            { outputTokens: 512, control: false, status: 'inconclusive-output-cap' },
            { outputTokens: 1024, control: true, status: 'pass' },
        ])
    })

    it('stops after the 1024 control is also truncated', async () => {
        const executeCell = async ({ cell, fixture: fixtureValue }: any) =>
            passResult(cell, fixtureValue, {
                finishReason: 'MAX_TOKENS',
                answer: null,
                usage: {
                    promptTokens: 100,
                    outputTokens: cell.outputTokens - 1,
                    candidateTokens: cell.outputTokens - 1,
                    thoughtTokens: 0,
                    totalTokens: 100 + cell.outputTokens - 1,
                },
            })
        const summary = await runStructuralPaid(baseOptions(executeCell))
        expect(summary).toMatchObject({
            complete: false,
            stage: 'L1',
            stopReason: 'text-oracle-inconclusive-output-cap',
            completedCalls: 2,
            outputControlsUsed: 1,
        })
        expect(summary.records[1]).toMatchObject({
            control: true,
            status: 'inconclusive-output-cap',
            cell: { outputTokens: 1024 },
        })
    })

    it('enforces the approved call and rated-cost bounds before a call', async () => {
        let calls = 0
        const executeCell = async ({ cell, fixture: fixtureValue }: any) => {
            calls++
            return passResult(cell, fixtureValue)
        }
        const summary = await runStructuralPaid({
            ...baseOptions(executeCell),
            maxCostUsd: 0.001,
        })
        expect(summary).toMatchObject({
            complete: false,
            stopReason: 'cost-cap-before-call',
            completedCalls: 0,
            maxCalls: MAX_CALLS,
            maximumOutputControls: MAX_OUTPUT_CONTROLS,
        })
        expect(calls).toBe(0)
    })

    it('resumes an exact two-pass decision without replaying screening calls', async () => {
        const executeCell = async ({ cell, fixture: fixtureValue }: any) =>
            passResult(cell, fixtureValue)
        const paused = await runStructuralPaid(baseOptions(executeCell))
        let resumedCalls = 0
        const resumed = await runStructuralPaid({
            ...baseOptions(async ({ cell, fixture: fixtureValue }: any) => {
                resumedCalls++
                return passResult(cell, fixtureValue)
            }),
            resumeSummary: paused,
            selectedResolution: 'medium',
        })
        expect(resumed).toMatchObject({
            complete: true,
            selectedResolution: 'medium',
            completedCalls: 21,
        })
        expect(resumedCalls).toBe(16)
        expect(resumed.records.slice(0, 5)).toEqual(paused.records)
    })

    it('keeps PDF first on the wire and strips unknown answer fields and secrets from results', async () => {
        const fixtureValues = fixtures()
        const pdfCell = createScreeningPlan()[1]
        const pdfBody = buildVertexRequestBody({
            cell: pdfCell,
            fixture: fixtureValues['maximum:1'],
        })
        expect(pdfBody.contents[0].parts[0]).toMatchObject({
            inlineData: { mimeType: 'application/pdf' },
            mediaResolution: { level: 'MEDIA_RESOLUTION_LOW' },
        })
        expect(pdfBody.contents[0].parts[1]).toHaveProperty('text')
        expect(pdfBody).not.toHaveProperty('tools')
        expect(JSON.stringify(pdfBody)).not.toContain('cachedContent')

        const balancedCell = createHierarchyPlan('medium')[0]
        const balancedBody = buildVertexRequestBody({
            cell: balancedCell,
            fixture: fixtureValues['balanced:2'],
        })
        expect(balancedBody.systemInstruction.parts[1].text).toContain('SYSTEM_AUTHORITY_41D7')
        expect(balancedBody.contents[0].parts[0].mediaResolution.level).toBe('MEDIA_RESOLUTION_MEDIUM')

        const checkpoints: any[] = []
        const summary = await runStructuralPaid({
            ...baseOptions(async ({ cell, fixture: fixtureValue }: any) => {
                const result = passResult(cell, fixtureValue)
                result.answer.privateNoise = `${CREDENTIAL_SECRET}:${TOKEN_SECRET}`
                return result
            }),
            onCheckpoint: async (checkpoint: any) => { checkpoints.push(checkpoint) },
        })
        const serialized = JSON.stringify(summary)
        expect(serialized).not.toContain(CREDENTIAL_SECRET)
        expect(serialized).not.toContain(TOKEN_SECRET)
        expect(serialized).not.toContain('fixture-pdf')
        expect(serialized).not.toContain('privateNoise')
        expect(summary.records.every((record: any) => !Object.hasOwn(record, 'pdf'))).toBe(true)
        expect(checkpoints).toHaveLength(summary.completedCalls * 2)
        expect(JSON.stringify(checkpoints)).not.toContain(CREDENTIAL_SECRET)
        expect(checkpoints[0]).toMatchObject({
            phase: 'call-start', attemptedCall: 1, completedCalls: 0,
        })
        expect(checkpoints[1]).toMatchObject({
            phase: 'call-complete', attemptedCall: 1, completedCalls: 1, record: { call: 1 },
        })
    })
})
