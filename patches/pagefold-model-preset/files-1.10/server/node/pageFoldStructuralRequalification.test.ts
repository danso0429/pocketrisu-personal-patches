import { describe, expect, it } from 'vitest'

const {
    NORMAL_OUTPUT_TOKENS,
    OUTPUT_CAP_CONTROL_TOKENS,
    STRUCTURAL_EXPECTATION,
    VERTEX_RATED_COST_CAP_USD,
    chooseResolution,
    createHierarchyPlan,
    createQualificationPlan,
    createScreeningPlan,
    createStructuralMessages,
    createTextControl,
    diffAnswer,
    encodeTranscript,
    evaluateObservation,
    expectedForClaim,
    promptForClaim,
    publicDryRun,
    responseSchemaForClaim,
    sanitizeAnswer,
} = require('./pageFoldStructuralRequalification.cjs')
const { validateCanonicalBytes } = require('./pageFoldPdfService.cjs')

function result(cell: any, status: string) {
    return { cell, status }
}

describe('PageFold structural requalification L0', () => {
    it('uses a gated Vertex-first plan with bounded conditional calls', () => {
        const screening = createScreeningPlan()
        expect(screening).toHaveLength(5)
        expect(screening[0]).toMatchObject({
            stage: 'L1', claim: 'text-oracle', transport: 'text', resolution: null,
        })
        expect(screening.slice(1).map((cell: any) => [cell.resolution, cell.claim])).toEqual([
            ['low', 'byte-structure'],
            ['medium', 'byte-structure'],
            ['low', 'grammar-role'],
            ['medium', 'grammar-role'],
        ])
        expect(createQualificationPlan('low')).toHaveLength(13)
        expect(createHierarchyPlan('low')).toHaveLength(3)
        expect(NORMAL_OUTPUT_TOKENS).toBe(512)
        expect(OUTPUT_CAP_CONTROL_TOKENS).toBe(1024)
        expect(VERTEX_RATED_COST_CAP_USD).toBe(0.25)
    })

    it('never selects a PDF resolution before the text oracle and both claims pass', () => {
        const screening = createScreeningPlan()
        expect(chooseResolution([result(screening[0], 'fail')])).toMatchObject({
            status: 'stop', reason: 'text-oracle-not-passed',
        })

        const textPass = result(screening[0], 'pass')
        const lowPass = [result(screening[1], 'pass'), result(screening[3], 'pass')]
        const mediumPass = [result(screening[2], 'pass'), result(screening[4], 'pass')]
        expect(chooseResolution([textPass, ...lowPass, ...mediumPass])).toMatchObject({
            status: 'decision-required',
            resolution: null,
            reason: 'both-resolutions-passed',
            candidates: ['low', 'medium'],
        })
        expect(chooseResolution([textPass, ...mediumPass, result(screening[1], 'fail'), result(screening[3], 'pass')]))
            .toMatchObject({ status: 'selected', resolution: 'medium' })
        expect(chooseResolution([textPass, result(screening[1], 'pass'), result(screening[3], 'fail')]))
            .toMatchObject({ status: 'stop', reason: 'no-resolution-passed-both-claims' })
    })

    it('tests recognition structurally instead of requiring verbatim echo', () => {
        const textExpected = expectedForClaim('text-oracle', {})
        expect(textExpected).toEqual(STRUCTURAL_EXPECTATION)
        const pdfExpected = expectedForClaim('byte-structure', {})
        expect(pdfExpected.samples.map((sample: any) => sample.label)).toEqual([
            'B_START', 'B_MIDDLE', 'B_END',
        ])
        for (const sample of pdfExpected.samples) {
            expect(sample.spaceRuns).toEqual([2, 3, 2])
            expect(sample.zwjCodePoints).toEqual([
                '1F468', '200D', '1F469', '200D', '1F467', '200D', '1F466',
            ])
        }
        expect(promptForClaim('byte-structure')).toMatch(/run counts/)
        expect(promptForClaim('byte-structure')).not.toMatch(/exact substring|copy the displayed source string\.$/)
        expect(responseSchemaForClaim('byte-structure')).toMatchObject({
            required: ['samples'],
            properties: { samples: { type: 'array' } },
        })
    })

    it('treats MAX_TOKENS as one predeclared cap control, not failed recall', () => {
        const inputCell = createScreeningPlan()[1]
        expect(evaluateObservation({
            cell: inputCell,
            answer: null,
            expected: expectedForClaim('byte-structure', {}),
            finishReason: 'MAX_TOKENS',
            outputTokens: 500,
        })).toMatchObject({
            status: 'inconclusive-output-cap',
            outputControlAllowed: true,
            nextOutputTokens: 1024,
        })

        expect(evaluateObservation({
            cell: { ...inputCell, outputTokens: 1024 },
            answer: null,
            expected: expectedForClaim('byte-structure', {}),
            finishReason: 'MAX_TOKENS',
            outputTokens: 1000,
        })).toMatchObject({
            status: 'inconclusive-output-cap',
            outputControlAllowed: false,
            nextOutputTokens: null,
        })
    })

    it('retains bounded synthetic observations and field-level differences', () => {
        const expected = expectedForClaim('text-oracle', {})
        const passing = {
            words: ['ALPHA', 'BETA'],
            spaceRuns: [2, 3, 2],
            zwjCodePoints: ['1F468', '200D', '1F469', '200D', '1F467', '200D', '1F466'],
            variationCodePoints: ['2708', 'FE0F'],
            tagCodePoints: ['E0067'],
            ignored: 'not retained',
        }
        expect(evaluateObservation({
            cell: createScreeningPlan()[0],
            answer: passing,
            expected,
            finishReason: 'STOP',
            outputTokens: 80,
        })).toMatchObject({ status: 'pass', differences: [] })

        const observed = sanitizeAnswer('text-oracle', { ...passing, spaceRuns: [0], ignored: 'secret-like-noise' })
        expect(observed).not.toHaveProperty('ignored')
        expect(diffAnswer('text-oracle', observed, expected)).toEqual([
            expect.objectContaining({ field: 'spaceRuns', kind: 'mismatch' }),
        ])
    })

    it('keeps maximum and balanced canonical rows deterministic and server-valid', () => {
        const messages = createStructuralMessages(100)
        const maximum = encodeTranscript(messages, 'maximum')
        const balanced = encodeTranscript(messages, 'balanced')
        const maximumParsed = validateCanonicalBytes(new TextEncoder().encode(maximum))
        const balancedParsed = validateCanonicalBytes(new TextEncoder().encode(balanced))

        expect(maximumParsed.header).toMatchObject({
            sourceMessageCount: 100, messageCount: 100, mode: 'maximum',
        })
        expect(balancedParsed.header).toMatchObject({
            sourceMessageCount: 100, messageCount: 98, mode: 'balanced',
        })
        expect(maximum).toContain('\\u200D')
        expect(maximum).toContain('\\uFE0F')
        expect(maximum).toContain('\\uDB40\\uDC67')
        expect(maximum).toContain('B_START')
        expect(maximum).toContain('B_MIDDLE')
        expect(maximum).toContain('B_END')
    })

    it('keeps the text control compact and independently expected', () => {
        const control = createTextControl()
        expect(control).toContain('WS|  ALPHA   BETA  |END')
        expect(control).toContain('ZWJ|👨‍👩‍👧‍👦|END')
        expect(control).toContain('VAR|✈️|END')
        expect(control).toContain('TAG|')
    })

    it('publishes no PDF bytes and keeps paid execution disabled in dry output', () => {
        const fixture = {
            mode: 'maximum',
            pages: 1,
            messageCount: 10,
            sourceBytes: 100,
            pdfBytes: 200,
            pdfSha256: 'a'.repeat(64),
            extractionExact: true,
            markerTriples: [['L000001', 'L000005', 'L000009']],
            retainedSystem: '',
            pdf: Buffer.from('must-not-escape'),
        }
        const output = publicDryRun({ 'maximum:1': fixture })
        expect(output.paidExecutionEnabled).toBe(false)
        expect(output.maximumCallsAfterApproval).toBe(23)
        expect(JSON.stringify(output)).not.toContain('must-not-escape')
        expect(output.fixtures[0]).not.toHaveProperty('pdf')
    })
})
