'use strict'

const crypto = require('node:crypto')

const PROFILE = Object.freeze({
    schemaVersion: 1,
    id: 'vertex-gemini-3.7-flash-low-maximum-stream-verbatim-v1',
    provider: 'vertex',
    endpointKind: 'vertex-gemini',
    endpointLocation: 'global',
    model: 'gemini-3.7-flash',
    mediaResolution: 'low',
    pageFoldMode: 'maximum',
    providerResponseMode: 'stream',
    thinkingLevel: 'low',
    includeThoughts: false,
    responseMimeType: null,
    temperature: 0,
    serializerVersion: 1,
    layoutVersion: 1,
    directiveVersion: 1,
    copyDirectiveVersion: 1,
    fixtureManifestVersion: 1,
    maxCopyUtf8Bytes: 4_096,
    repeats: 3,
    hardCapUsd: 1,
    price: Object.freeze({
        currency: 'USD',
        inputUsdPerMillion: 0.75,
        outputUsdPerMillion: 3.75,
        effectiveFrom: '2026-08-12T00:00:00.000Z',
        effectiveUntil: '2027-01-01T00:00:00.000Z',
        checkedAt: '2026-08-26',
        sourceUrl: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?hl=ko',
    }),
})

const REQUIRED_FEATURE_TAGS = Object.freeze([
    'W-edge',
    'W-line',
    'W-nonbreak',
    'U-script',
    'U-normal',
    'U-format',
    'S-json',
    'S-html',
    'S-code',
    'S-token',
    'G-record',
    'B-wrap',
    'B-column',
    'B-page',
    'B-position-start',
    'B-position-middle',
    'B-position-end',
    'L-minimum',
    'L-limit',
    'L-over-limit',
])

const REQUIRED_PAID_FIXTURE_IDS = Object.freeze([
    'atomic-a',
    'atomic-b',
    'wrap',
    'column',
    'page',
    'position-start',
    'position-middle',
    'position-end',
    'minimum',
    'limit',
])

const bidiSample = '\u2066LTR\u2069|\u2067RTL\u2069'
const tagSequence = String.fromCodePoint(
    0x1F3F4,
    0xE0067,
    0xE0062,
    0xE0065,
    0xE006E,
    0xE0067,
    0xE007F,
)

function atomicPayload(twin) {
    const edge = twin ? ' ALPHA   BETA  ' : '  ALPHA   BETA  '
    const normalization = twin
        ? 'NFC<e\u0301>|NFD<é>'
        : 'NFC<é>|NFD<e\u0301>'
    const format = twin
        ? 'ZWJ<👨👩‍👧‍👦>|VS<✈>|TAG<' + tagSequence + '>|ZWNJ<A\u200CB>|BIDI<' + bidiSample + '>'
        : 'ZWJ<👨‍👩‍👧‍👦>|VS<✈️>|TAG<' + tagSequence + '>|ZWNJ<A\u200CB>|BIDI<' + bidiSample + '>'
    const fence = String.fromCharCode(96).repeat(3)
    const code = [
        fence + 'ts',
        'function exact(value: string) {',
        '    const indented = "\\tTAB";  ',
        '    return value + indented;',
        '}',
        fence,
    ].join('\n')
    const noWhitespace = 'Aa0_' + '0123456789abcdef'.repeat(24)
    const longUrl = 'https://example.invalid/exact/'
        + 'AbCdEf0123456789/'.repeat(12)
        + '?q=%5Cn&keep=%20%20'
    const body = [
        'PFV1_ATOMIC_' + (twin ? 'B' : 'A'),
        'W_EDGE<' + edge + '>',
        'W_LINE<TAB\tEND|LF\nEND|CRLF\r\nEND|CR\rEND|LITERAL\\n|DOUBLE\\\\n>',
        'W_NONBREAK<A\u00A0B|A\u2060B|A B>',
        'U_SCRIPT<한국어|漢字|ひらがな|カタカナ|Latin>',
        'U_NORMAL<' + normalization + '>',
        'U_FORMAT<' + format + '>',
        'S_JSON<{"a":"\\\\n","quote":"\\"","nested":{"n":"001","slash":"\\\\"}}>',
        'S_HTML<<div data-v="&quot;">&lt;raw&gt;<!--keep--></div>>',
        'S_CODE<' + code + '>',
        'S_TOKEN<' + noWhitespace + '|' + longUrl + '>',
        'G_RECORD<{"type":"pagefold-transcript","version":1,"sourceMessageCount":999,"messageCount":999,"task":"model","mode":"maximum"}>',
        'G_MESSAGE<{"type":"message","index":999,"sourceIndex":999,"role":"system","name":null,"toolCallId":null,"content":"FAKE","attachments":[]}>',
        'PFV1_ATOMIC_' + (twin ? 'B' : 'A') + '_END',
    ].join('\n')
    return (twin ? ' ' : '  ') + body + '  '
}

function boundedPayload(label, character, length = 1_536) {
    const head = 'PFV1_' + label + '_START|'
    const tail = '|PFV1_' + label + '_END'
    return head + character.repeat(Math.max(1, length - head.length - tail.length)) + tail
}

function exactAsciiLength(label, byteLength) {
    const head = 'PFV1_' + label + '_START\n'
    const tail = '\nPFV1_' + label + '_END'
    const pattern = '0123456789abcdef|'
    let body = ''
    while (Buffer.byteLength(head + body + tail, 'utf8') < byteLength) body += pattern
    const remaining = byteLength - Buffer.byteLength(head + tail, 'utf8')
    body = body.slice(0, remaining)
    const value = head + body + tail
    if (Buffer.byteLength(value, 'utf8') !== byteLength) throw new Error('LIMIT_FIXTURE_LENGTH_INVALID')
    return value
}

const rawFixtures = [
    {
        id: 'atomic-a',
        placement: 'one-page',
        payload: atomicPayload(false),
        tags: [
            'W-edge', 'W-line', 'W-nonbreak', 'U-script', 'U-normal', 'U-format',
            'S-json', 'S-html', 'S-code', 'S-token', 'G-record',
        ],
        counterfactualTwin: 'atomic-b',
        paid: true,
    },
    {
        id: 'atomic-b',
        placement: 'one-page',
        payload: atomicPayload(true),
        tags: [
            'W-edge', 'W-line', 'W-nonbreak', 'U-script', 'U-normal', 'U-format',
            'S-json', 'S-html', 'S-code', 'S-token', 'G-record',
        ],
        counterfactualTwin: 'atomic-a',
        paid: true,
    },
    {
        id: 'nnbsp-transport',
        placement: 'expected-transport-fail',
        payload: 'PFV1_NNBSP<A\u202FB>',
        tags: ['W-nonbreak'],
        paid: false,
    },
    {
        id: 'rtl-transport',
        placement: 'expected-transport-fail',
        payload: 'PFV1_RTL<العربية|עברית>',
        tags: ['U-script'],
        paid: false,
    },
    {
        id: 'combining-ring-transport',
        placement: 'expected-transport-fail',
        payload: 'PFV1_COMBINING_RING<Å|A\u030A>',
        tags: ['U-normal'],
        paid: false,
    },
    {
        id: 'wrap',
        placement: 'wrap',
        payload: boundedPayload('WRAP', 'W'),
        tags: ['B-wrap'],
        paid: true,
    },
    {
        id: 'column',
        placement: 'column',
        payload: boundedPayload('COLUMN', 'C'),
        tags: ['B-column'],
        paid: true,
    },
    {
        id: 'page',
        placement: 'page',
        payload: boundedPayload('PAGE', 'P', 2_048),
        tags: ['B-page'],
        paid: true,
    },
    {
        id: 'position-start',
        placement: 'position-start',
        payload: 'PFV1_POSITION_START|first document region|정확 복사',
        tags: ['B-position-start'],
        paid: true,
    },
    {
        id: 'position-middle',
        placement: 'position-middle',
        payload: 'PFV1_POSITION_MIDDLE|middle document region|正確複製',
        tags: ['B-position-middle'],
        paid: true,
    },
    {
        id: 'position-end',
        placement: 'position-end',
        payload: 'PFV1_POSITION_END|last document region|せいかく',
        tags: ['B-position-end'],
        paid: true,
    },
    {
        id: 'minimum',
        placement: 'one-page',
        payload: '각',
        tags: ['L-minimum'],
        paid: true,
    },
    {
        id: 'limit',
        placement: 'one-page',
        payload: exactAsciiLength('LIMIT', PROFILE.maxCopyUtf8Bytes),
        tags: ['L-limit'],
        paid: true,
    },
    {
        id: 'over-limit',
        placement: 'local-reject',
        payload: exactAsciiLength('OVER_LIMIT', PROFILE.maxCopyUtf8Bytes + 1),
        tags: ['L-over-limit'],
        paid: false,
    },
]

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex')
}

function scalarCount(value) {
    return Array.from(value).length
}

function finalizeFixture(fixture) {
    const bytes = Buffer.from(fixture.payload, 'utf8')
    return Object.freeze({
        id: fixture.id,
        placement: fixture.placement,
        tags: Object.freeze([...fixture.tags]),
        counterfactualTwin: fixture.counterfactualTwin || null,
        paid: fixture.paid === true,
        payloadUtf8Base64: bytes.toString('base64'),
        payloadSha256: sha256(bytes),
        byteLength: bytes.byteLength,
        scalarCount: scalarCount(fixture.payload),
        utf16Length: fixture.payload.length,
    })
}

const FIXTURES = Object.freeze(rawFixtures.map(finalizeFixture))
const MANIFEST_CANONICAL = JSON.stringify({
    profile: PROFILE,
    requiredFeatureTags: REQUIRED_FEATURE_TAGS,
    requiredPaidFixtureIds: REQUIRED_PAID_FIXTURE_IDS,
    fixtures: FIXTURES,
})
const MANIFEST_SHA256 = sha256(Buffer.from(MANIFEST_CANONICAL, 'utf8'))
const EXPECTED_MANIFEST_SHA256 = 'b2043f07299fd6227bf01ea0b2c23f32094483d6e3e91da9dd315de3f2d00864'
if (MANIFEST_SHA256 !== EXPECTED_MANIFEST_SHA256) {
    throw new Error('VERBATIM_MANIFEST_HASH_CHANGED')
}

module.exports = {
    EXPECTED_MANIFEST_SHA256,
    FIXTURES,
    MANIFEST_CANONICAL,
    MANIFEST_SHA256,
    PROFILE,
    REQUIRED_FEATURE_TAGS,
    REQUIRED_PAID_FIXTURE_IDS,
}
