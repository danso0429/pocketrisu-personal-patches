import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

const {
    MAX_CALLS,
    MAX_OUTPUT_CONTROLS,
    PAID_ORACLE_VERSION,
    PAID_OUTPUT_TOKENS,
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
        markerWindows: Array.from({ length: pages }, (_, index) => ({
            first: `L${String(index * 3).padStart(6, '0')}`,
            centers: [`L${String(index * 3 + 1).padStart(6, '0')}`],
            last: `L${String(index * 3 + 2).padStart(6, '0')}`,
        })),
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
            ...expectedForClaim(cell.claim, fixtureValue || {}, PAID_ORACLE_VERSION),
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
            oracleVersion: 7,
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
                result.answer.samples[0].spaceRunPositions = []
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

    it('uses one first-shot 2048 budget and never retries MAX_TOKENS', async () => {
        const executeCell = async ({ cell, fixture: fixtureValue }: any) => {
            if (cell.claim === 'text-oracle') {
                return passResult(cell, fixtureValue, {
                    finishReason: 'MAX_TOKENS',
                    answer: null,
                    usage: {
                        promptTokens: 100,
                        outputTokens: 2000,
                        candidateTokens: 2000,
                        thoughtTokens: 0,
                        totalTokens: 2100,
                    },
                })
            }
            return passResult(cell, fixtureValue)
        }
        const summary = await runStructuralPaid(baseOptions(executeCell))
        expect(summary).toMatchObject({
            complete: false,
            stage: 'L1',
            stopReason: 'text-oracle-inconclusive-output-cap',
            completedCalls: 1,
            outputControlsUsed: 0,
            maxCalls: 21,
            maximumOutputControls: 0,
            paidOutputTokens: 2048,
            outputCapControlTokens: null,
        })
        expect(summary.records[0]).toMatchObject({
            control: false,
            status: 'inconclusive-output-cap',
            cell: { outputTokens: 2048 },
        })
        expect(PAID_OUTPUT_TOKENS).toBe(2048)
        expect(MAX_CALLS).toBe(21)
        expect(MAX_OUTPUT_CONTROLS).toBe(0)
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

        await expect(runStructuralPaid({
            ...baseOptions(executeCell),
            resumeSummary: { ...paused, oracleVersion: 6 },
            selectedResolution: 'medium',
        })).rejects.toMatchObject({ code: 'RESUME_STATE_INVALID' })
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
        expect(pdfBody.contents[0].parts[1].text).toMatch(/base-10 Unicode scalar values/)
        expect(pdfBody.generationConfig.maxOutputTokens).toBe(2048)
        expect(pdfBody.generationConfig.responseSchema.properties.samples.items.properties.zwjSemanticKind)
            .toEqual({ type: 'string' })
        expect(pdfBody).not.toHaveProperty('tools')
        expect(JSON.stringify(pdfBody)).not.toContain('cachedContent')

        const balancedCell = createHierarchyPlan('medium')[0]
        const balancedBody = buildVertexRequestBody({
            cell: balancedCell,
            fixture: fixtureValues['balanced:2'],
        })
        expect(balancedBody.systemInstruction.parts[1].text).toContain('SYSTEM_AUTHORITY_41D7')
        expect(balancedBody.contents[0].parts[0].mediaResolution.level).toBe('MEDIA_RESOLUTION_MEDIUM')

        const textBody = buildVertexRequestBody({
            cell: createScreeningPlan()[0],
            fixture: null,
        })
        expect(textBody.contents[0].parts[0].text).toContain('PAGEFOLD_RESPONSE_ORACLE_V7')
        expect(textBody.contents[0].parts[0].text).toContain('ZWJ_SEMANTIC_KIND|family')
        expect(textBody.contents[0].parts[0].text).not.toContain('👨‍👩‍👧‍👦')
        expect(textBody.generationConfig.responseSchema.required).toContain('roles')
        expect(textBody.generationConfig.responseSchema.properties.roles.items.required)
            .toEqual(['marker', 'role'])

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
            oracleVersion: 7, phase: 'call-start', attemptedCall: 1, completedCalls: 0,
        })
        expect(checkpoints[1]).toMatchObject({
            oracleVersion: 7,
            phase: 'call-complete',
            attemptedCall: 1,
            completedCalls: 1,
            record: { call: 1 },
        })
    })
})
