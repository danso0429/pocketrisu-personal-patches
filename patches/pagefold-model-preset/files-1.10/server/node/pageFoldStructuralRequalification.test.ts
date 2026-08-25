import { describe, expect, it } from 'vitest'

const {
    NORMAL_OUTPUT_TOKENS,
    OUTPUT_CAP_CONTROL_TOKENS,
    OUTPUT_CAP_CONTROL_TOKENS_V3,
    PAID_OUTPUT_TOKENS_V4,
    STRUCTURAL_ORACLE_V1,
    STRUCTURAL_ORACLE_V2,
    STRUCTURAL_ORACLE_V3,
    STRUCTURAL_ORACLE_V4,
    STRUCTURAL_ORACLE_V5,
    STRUCTURAL_ORACLE_V6,
    STRUCTURAL_EXPECTATION,
    STRUCTURAL_EXPECTATION_V2,
    STRUCTURAL_EXPECTATION_V3,
    STRUCTURAL_EXPECTATION_V4,
    STRUCTURAL_EXPECTATION_V5,
    STRUCTURAL_EXPECTATION_V6,
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
    markerWindow,
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

    it('keeps v1 historical while v2 separates response control from PDF recognition', () => {
        expect(STRUCTURAL_ORACLE_V1).toBe(1)
        expect(STRUCTURAL_ORACLE_V2).toBe(2)
        expect(STRUCTURAL_EXPECTATION.zwjCodePoints[0]).toBe('1F468')
        expect(STRUCTURAL_EXPECTATION_V2.zwjCodePoints).toEqual([
            128104, 8205, 128105, 8205, 128103, 8205, 128102,
        ])

        const textExpected = expectedForClaim('text-oracle', {}, STRUCTURAL_ORACLE_V2)
        expect(textExpected).toMatchObject({
            spaceRuns: [2, 3, 2],
            variationCodePoints: [9992, 65039],
            tagCodePoints: [917607],
            roles: ['R_SYS:system', 'R_USER:user', 'R_ASSISTANT:assistant', 'R_TOOL:tool'],
        })
        const byteExpected = expectedForClaim('byte-structure', {}, STRUCTURAL_ORACLE_V2)
        expect(byteExpected.samples[0]).not.toHaveProperty('roles')
        expect(byteExpected.samples[0].tagCodePoints).toEqual([917607])

        const textControl = createTextControl(STRUCTURAL_ORACLE_V2)
        expect(textControl).toContain('PAGEFOLD_RESPONSE_ORACLE_V2')
        expect(textControl).toContain('TAG_SCALARS_DECIMAL|917607')
        expect(textControl).not.toContain('👨‍👩‍👧‍👦')
        expect(promptForClaim('text-oracle', STRUCTURAL_ORACLE_V2)).toMatch(/response-schema control/)
        expect(promptForClaim('byte-structure', STRUCTURAL_ORACLE_V2)).toMatch(/base-10 JSON integers/)

        const schema = responseSchemaForClaim('text-oracle', STRUCTURAL_ORACLE_V2)
        expect(schema.required).toContain('roles')
        expect(schema.properties.zwjCodePoints).toEqual({
            type: 'array', items: { type: 'integer' },
        })

        expect(evaluateObservation({
            cell: createScreeningPlan()[0],
            answer: textExpected,
            expected: textExpected,
            finishReason: 'STOP',
            outputTokens: 80,
            oracleVersion: STRUCTURAL_ORACLE_V2,
        })).toMatchObject({ status: 'pass', differences: [] })
        expect(evaluateObservation({
            cell: createScreeningPlan()[0],
            answer: { ...textExpected, tagCodePoints: ['E0067'] },
            expected: textExpected,
            finishReason: 'STOP',
            outputTokens: 80,
            oracleVersion: STRUCTURAL_ORACLE_V2,
        })).toMatchObject({
            status: 'fail',
            differences: [expect.objectContaining({ field: 'tagCodePoints' })],
        })
        expect(() => responseSchemaForClaim('text-oracle', 7))
            .toThrowError(expect.objectContaining({ code: 'ORACLE_VERSION_INVALID' }))
    })

    it('uses unambiguous lengths, sequence scalars, role objects, and a 2048 v3 control', () => {
        expect(STRUCTURAL_ORACLE_V3).toBe(3)
        expect(OUTPUT_CAP_CONTROL_TOKENS_V3).toBe(2048)
        expect(STRUCTURAL_EXPECTATION_V3).toEqual({
            words: ['ALPHA', 'BETA'],
            spaceRunLengths: [2, 3, 2],
            zwjSequenceCodePoints: [128104, 8205, 128105, 8205, 128103, 8205, 128102],
            variationSequenceCodePoints: [9992, 65039],
            tagSequenceCodePoints: [917607],
        })

        const textExpected = expectedForClaim('text-oracle', {}, STRUCTURAL_ORACLE_V3)
        expect(textExpected.roles).toEqual([
            { marker: 'R_SYS', role: 'system' },
            { marker: 'R_USER', role: 'user' },
            { marker: 'R_ASSISTANT', role: 'assistant' },
            { marker: 'R_TOOL', role: 'tool' },
        ])
        expect(expectedForClaim('grammar-role', { messageCount: 1000 }, STRUCTURAL_ORACLE_V3).roles)
            .toEqual([
                { marker: 'R_USER', role: 'user' },
                { marker: 'R_ASSISTANT', role: 'assistant' },
                { marker: 'R_TOOL', role: 'tool' },
                { marker: 'R_SYS', role: 'system' },
            ])
        expect(expectedForClaim('balanced-hierarchy', {}, STRUCTURAL_ORACLE_V3).pdfRoles)
            .toEqual([
                { marker: 'R_USER', role: 'user' },
                { marker: 'R_ASSISTANT', role: 'assistant' },
                { marker: 'R_TOOL', role: 'tool' },
            ])

        const control = createTextControl(STRUCTURAL_ORACLE_V3)
        expect(control).toContain('PAGEFOLD_RESPONSE_ORACLE_V3')
        expect(control).toContain('SPACE_RUN_LENGTHS_DECIMAL|2|3|2')
        expect(control).toContain('ZWJ_SEQUENCE_SCALARS_DECIMAL|128104|8205')
        expect(promptForClaim('byte-structure', STRUCTURAL_ORACLE_V3)).toMatch(/not the number of runs/)
        expect(promptForClaim('byte-structure', STRUCTURAL_ORACLE_V3)).toMatch(/including emoji scalars/)
        expect(responseSchemaForClaim('grammar-role', STRUCTURAL_ORACLE_V3))
            .toMatchObject({
                properties: {
                    roles: {
                        type: 'array',
                        items: { required: ['marker', 'role'] },
                    },
                },
            })

        const inputCell = createScreeningPlan()[1]
        expect(evaluateObservation({
            cell: inputCell,
            answer: null,
            expected: expectedForClaim('byte-structure', {}, STRUCTURAL_ORACLE_V3),
            finishReason: 'MAX_TOKENS',
            outputTokens: 500,
            oracleVersion: STRUCTURAL_ORACLE_V3,
        })).toMatchObject({
            status: 'inconclusive-output-cap',
            outputControlAllowed: true,
            nextOutputTokens: 2048,
        })
        expect(evaluateObservation({
            cell: { ...inputCell, outputTokens: 2048 },
            answer: null,
            expected: expectedForClaim('byte-structure', {}, STRUCTURAL_ORACLE_V3),
            finishReason: 'MAX_TOKENS',
            outputTokens: 2000,
            oracleVersion: STRUCTURAL_ORACLE_V3,
        })).toMatchObject({
            outputControlAllowed: false,
            nextOutputTokens: null,
        })
    })

    it('separates exact extraction from semantic v4 recall with one 2048 attempt', () => {
        expect(STRUCTURAL_ORACLE_V4).toBe(4)
        expect(PAID_OUTPUT_TOKENS_V4).toBe(2048)
        expect(STRUCTURAL_EXPECTATION_V4).toEqual({
            words: ['ALPHA', 'BETA'],
            spaceRunPositions: ['leading', 'between', 'trailing'],
            zwjSemanticMembers: ['man', 'woman', 'girl', 'boy'],
            zwjJoinerCount: 3,
            variationSequenceCodePoints: [9992, 65039],
            tagSequenceCodePoints: [917607],
        })

        const textExpected = expectedForClaim('text-oracle', {}, STRUCTURAL_ORACLE_V4)
        expect(textExpected.roles).toEqual([
            { marker: 'R_SYS', role: 'system' },
            { marker: 'R_USER', role: 'user' },
            { marker: 'R_ASSISTANT', role: 'assistant' },
            { marker: 'R_TOOL', role: 'tool' },
        ])
        const byteExpected = expectedForClaim('byte-structure', {}, STRUCTURAL_ORACLE_V4)
        expect(byteExpected.samples[0]).toMatchObject({
            spaceRunPositions: ['leading', 'between', 'trailing'],
            zwjSemanticMembers: ['man', 'woman', 'girl', 'boy'],
            zwjJoinerCount: 3,
            tagSequenceCodePoints: [917607],
        })

        const control = createTextControl(STRUCTURAL_ORACLE_V4)
        expect(control).toContain('PAGEFOLD_RESPONSE_ORACLE_V4')
        expect(control).toContain('SPACE_RUN_POSITIONS|leading|between|trailing')
        expect(control).toContain('ZWJ_SEMANTIC_MEMBERS|man|woman|girl|boy')
        expect(promptForClaim('byte-structure', STRUCTURAL_ORACLE_V4))
            .toMatch(/do not estimate typographic run length/)
        expect(responseSchemaForClaim('byte-structure', STRUCTURAL_ORACLE_V4))
            .toMatchObject({
                properties: {
                    samples: {
                        items: {
                            properties: {
                                zwjSemanticMembers: { type: 'array', items: { type: 'string' } },
                                zwjJoinerCount: { type: 'integer' },
                            },
                        },
                    },
                },
            })

        const inputCell = { ...createScreeningPlan()[1], outputTokens: 2048 }
        expect(evaluateObservation({
            cell: inputCell,
            answer: null,
            expected: byteExpected,
            finishReason: 'MAX_TOKENS',
            outputTokens: 2000,
            oracleVersion: STRUCTURAL_ORACLE_V4,
        })).toMatchObject({
            status: 'inconclusive-output-cap',
            outputControlAllowed: false,
            nextOutputTokens: null,
        })
    })

    it('uses stable family meaning while preserving exact v4 decomposition history', () => {
        expect(STRUCTURAL_ORACLE_V5).toBe(5)
        expect(STRUCTURAL_EXPECTATION_V4.zwjSemanticMembers).toEqual([
            'man', 'woman', 'girl', 'boy',
        ])
        expect(STRUCTURAL_EXPECTATION_V5).toEqual({
            words: ['ALPHA', 'BETA'],
            spaceRunPositions: ['leading', 'between', 'trailing'],
            zwjSemanticKind: 'family',
            zwjJoinerCount: 3,
            variationSequenceCodePoints: [9992, 65039],
            tagSequenceCodePoints: [917607],
        })

        const expected = expectedForClaim('byte-structure', {}, STRUCTURAL_ORACLE_V5)
        expect(expected.samples[0]).toMatchObject({
            zwjSemanticKind: 'family',
            zwjJoinerCount: 3,
        })
        expect(expected.samples[0]).not.toHaveProperty('zwjSemanticMembers')
        const control = createTextControl(STRUCTURAL_ORACLE_V5)
        expect(control).toContain('PAGEFOLD_RESPONSE_ORACLE_V5')
        expect(control).toContain('ZWJ_SEMANTIC_KIND|family')
        expect(promptForClaim('byte-structure', STRUCTURAL_ORACLE_V5))
            .toMatch(/single lowercase semantic kind/)
        expect(responseSchemaForClaim('byte-structure', STRUCTURAL_ORACLE_V5))
            .toMatchObject({
                properties: {
                    samples: {
                        items: {
                            properties: {
                                zwjSemanticKind: { type: 'string' },
                                zwjJoinerCount: { type: 'integer' },
                            },
                        },
                    },
                },
            })
    })

    it('uses exact one-or-two center windows for v6 physical pages', () => {
        expect(STRUCTURAL_ORACLE_V6).toBe(6)
        expect(STRUCTURAL_EXPECTATION_V6).toEqual(STRUCTURAL_EXPECTATION_V5)
        expect(markerWindow({
            spans: [{ actualText: 'L000000 L000001 L000002 L000003 L000004 L000005' }],
        })).toEqual({
            first: 'L000000',
            centers: ['L000002', 'L000003'],
            last: 'L000005',
        })
        expect(markerWindow({
            spans: [{ actualText: 'L000010 L000011 L000012 L000013 L000014' }],
        })).toEqual({
            first: 'L000010',
            centers: ['L000012'],
            last: 'L000014',
        })

        const fixture = {
            markerWindows: [{
                first: 'L000000',
                centers: ['L000002', 'L000003'],
                last: 'L000005',
            }],
        }
        expect(expectedForClaim('page-markers', fixture, STRUCTURAL_ORACLE_V6))
            .toEqual({ markers: fixture.markerWindows })
        expect(promptForClaim('page-markers', STRUCTURAL_ORACLE_V6))
            .toMatch(/both lower and upper center codes/)
        expect(responseSchemaForClaim('page-markers', STRUCTURAL_ORACLE_V6))
            .toMatchObject({
                properties: {
                    markers: {
                        items: { required: ['first', 'centers', 'last'] },
                    },
                },
            })
        expect(createTextControl(STRUCTURAL_ORACLE_V6))
            .toContain('PAGEFOLD_RESPONSE_ORACLE_V6')
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
            markerWindows: [{
                first: 'L000001', centers: ['L000005'], last: 'L000009',
            }],
            retainedSystem: '',
            pdf: Buffer.from('must-not-escape'),
        }
        const output = publicDryRun({ 'maximum:1': fixture })
        expect(output.paidExecutionEnabled).toBe(false)
        expect(output.maximumCallsAfterApproval).toBe(21)
        expect(output.oracleVersions).toEqual({ historical: [1, 2, 3, 4, 5], paidRunner: 6 })
        expect(output.historicalOutputCapControlTokens).toEqual([1024, 2048])
        expect(output.paidOutputTokens).toBe(2048)
        expect(output.outputCapControlTokens).toBeNull()
        expect(output.responseOracleV2).toMatchObject({
            control: expect.stringContaining('PAGEFOLD_RESPONSE_ORACLE_V2'),
            expected: { tagCodePoints: [917607] },
            responseSchema: {
                properties: {
                    tagCodePoints: { type: 'array', items: { type: 'integer' } },
                },
            },
        })
        expect(output.responseOracleV3).toMatchObject({
            control: expect.stringContaining('PAGEFOLD_RESPONSE_ORACLE_V3'),
            expected: { tagSequenceCodePoints: [917607] },
            responseSchema: {
                properties: {
                    tagSequenceCodePoints: { type: 'array', items: { type: 'integer' } },
                },
            },
        })
        expect(output.responseOracleV4).toMatchObject({
            control: expect.stringContaining('PAGEFOLD_RESPONSE_ORACLE_V4'),
            expected: {
                spaceRunPositions: ['leading', 'between', 'trailing'],
                zwjJoinerCount: 3,
                tagSequenceCodePoints: [917607],
            },
            responseSchema: {
                properties: {
                    zwjSemanticMembers: { type: 'array', items: { type: 'string' } },
                },
            },
        })
        expect(output.responseOracleV5).toMatchObject({
            control: expect.stringContaining('PAGEFOLD_RESPONSE_ORACLE_V5'),
            expected: {
                zwjSemanticKind: 'family',
                zwjJoinerCount: 3,
            },
            responseSchema: {
                properties: {
                    zwjSemanticKind: { type: 'string' },
                },
            },
        })
        expect(output.responseOracleV6).toMatchObject({
            control: expect.stringContaining('PAGEFOLD_RESPONSE_ORACLE_V6'),
            expected: {
                zwjSemanticKind: 'family',
                zwjJoinerCount: 3,
            },
        })
        expect(JSON.stringify(output)).not.toContain('must-not-escape')
        expect(output.fixtures[0]).not.toHaveProperty('pdf')
    })
})
