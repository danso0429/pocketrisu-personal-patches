'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { compose, revertUnit } = require('../src/compose.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const manifest = require('../patches/pagefold-model-preset/manifest.cjs')

test('PageFold prototype is exact-1.10 reviewing and excluded from the catalog', () => {
    assert.equal(manifest.id, 'pagefold-model-preset')
    assert.equal(manifest.userSelectable, true)
    assert.equal(manifest.allDefault, false)
    assert.deepEqual(manifest.targets.pocketrisu, { verified: [], reviewing: ['1.10.0'] })
    assert.match(manifest.source, /Independent implementation/)
    assert.equal(loadCatalog().some((pack) => pack.id === manifest.id), false)
    assert.ok(manifest.units.every((unit) =>
        unit.targetVersions?.pocketrisu?.length === 1
        && unit.targetVersions.pocketrisu[0] === '1.10.0'
    ))
})

test('prototype dependency and owned-file graph composes and reverts exactly', () => {
    const baselines = new Map()
    for (const unit of manifest.units) {
        if (unit.type === 'owned') {
            if (!baselines.has(unit.file)) baselines.set(unit.file, null)
            continue
        }
        // Some later PageFold units deliberately anchor inside the exact marker
        // produced by an earlier PageFold owner. That marker is not baseline
        // source and must not be synthesized independently here.
        const prior = baselines.get(unit.file) ?? ''
        if (prior.includes(unit.anchor)) continue
        baselines.set(unit.file, prior + unit.anchor + `# synthetic-boundary:${unit.id}\n`)
    }
    const plan = compose(manifest.units, baselines)
    assert.deepEqual(plan.collisions, [])
    assert.match(plan.outputs.get('package.json'), /"pdf-lib": "1\.17\.1"/)
    assert.match(plan.outputs.get('pnpm-lock.yaml'), /pdf-lib@1\.17\.1/)
    assert.match(plan.outputs.get('src/ts/pagefold/canonicalTranscript.ts'), /encodePageFoldJsonString/)
    assert.match(plan.outputs.get('src/ts/pagefold/canonicalTranscript.test.ts'), /fakeHeader/)
    assert.match(plan.outputs.get('server/node/pageFoldPdfService.cjs'), /maxPages: 8/)
    assert.match(plan.outputs.get('server/node/pageFoldPdfWorker.cjs'), /ActualText/)
    assert.match(plan.outputs.get('server/node/pageFoldStructuralPaidRunner.cjs'), /const MAX_CALLS = 21/)
    assert.match(plan.outputs.get('server/node/pageFoldStructuralPaidRunner.cjs'), /const MAX_OUTPUT_CONTROLS = 0/)
    assert.match(plan.outputs.get('server/node/pageFoldStructuralPaidRunner.cjs'), /STRUCTURAL_ORACLE_V8/)
    assert.match(plan.outputs.get('server/node/pageFoldStructuralPaidRunner.test.ts'), /resumes an exact two-pass decision/)
    assert.match(plan.outputs.get('src/ts/preset/types.ts'), /pageFold\?: ModelPresetPageFoldConfig/)
    assert.match(plan.outputs.get('src/ts/preset/types.ts'), /pageFold\?: PageFoldRoleOverrides/)
    assert.match(plan.outputs.get('src/ts/pagefold/qualifiedRoute.ts'), /vertex-gemini-native:gemini-37-flash/)
    assert.match(plan.outputs.get('src/ts/pagefold/qualifiedRoute.ts'), /MEDIA_RESOLUTION_LOW/)
    assert.match(plan.outputs.get('src/ts/pagefold/resolve.ts'), /resolvePageFoldState/)
    assert.match(plan.outputs.get('src/ts/preset/dbDefaults.ts'), /normalizePageFoldConfig/)
    assert.match(plan.outputs.get('src/ts/pagefold/httpRenderPort.ts'), /application\/octet-stream/)
    assert.match(plan.outputs.get('src/ts/pagefold/httpRenderPort.ts'), /PAGEFOLD_RENDER_HASH_MISMATCH/)
    assert.match(plan.outputs.get('server/node/pageFoldRenderRoute.cjs'), /cache-control/)
    assert.match(plan.outputs.get('server/node/server.cjs'), /const pageFoldRawParser = express\.raw/)
    assert.match(plan.outputs.get('server/node/server.cjs'), /pageFoldRenderRoute\.cjs/)
    assert.match(plan.outputs.get('src/ts/pagefold/directives.ts'), /PAGEFOLD_SYSTEM_DECODER_V1/)
    assert.match(plan.outputs.get('src/ts/pagefold/prepare.ts'), /preparePageFoldWire/)
    assert.match(plan.outputs.get('src/ts/pagefold/geminiWire.ts'), /MEDIA_RESOLUTION_LOW/)
    assert.match(plan.outputs.get('src/ts/preset/adapter/googleGemini.ts'), /assertPreparedPageFoldGeminiBody/)
    assert.match(plan.outputs.get('src/ts/process/request/request.ts'), /PageFold blocked:/)
    assert.match(plan.outputs.get('src/ts/process/request/request.ts'), /redactPreparedRequestForDisplay/)
    assert.match(plan.outputs.get('src/ts/requestLog.ts'), /redactRequestLogHeaders/)
    assert.match(plan.outputs.get('server/node/request-logs.cjs'), /redactPageFoldRequestLogText/)
    assert.match(plan.outputs.get('src/ts/pagefold/budget.ts'), /lowMediaTokensPerPage/)
    assert.match(plan.outputs.get('src/ts/pagefold/failurePolicy.ts'), /allowClassicFallback: false/)
    assert.match(plan.outputs.get('src/ts/tokenizer.ts'), /this\.encodeText\(data\.content\)/)
    assert.match(plan.outputs.get('src/ts/process/index.svelte.ts'), /pageFoldAssemblyOn/)
    assert.match(plan.outputs.get('src/ts/process/index.svelte.ts'), /!pageFoldAssemblyOn && inputTokens/)
    assert.match(plan.outputs.get('src/ts/process/request/request.ts'), /if\(!pageFoldRouteState\)/)
    assert.match(plan.outputs.get('src/ts/process/request/request.ts'), /pageFoldContentRetryPolicy\('blank-response'\)/)
    assert.match(plan.outputs.get('src/ts/process/request/request.ts'), /pageFoldRouteState\.stage === 'rendered'/)
    assert.match(plan.outputs.get('src/lib/Setting/Pages/Model/PageFoldPresetSettings.svelte'), /disabled=\{!modeReady\}/)
    assert.match(plan.outputs.get('src/lib/Setting/Pages/Model/PageFoldPresetSettings.svelte'), /pageFoldNoResolutionPicker/)
    assert.match(plan.outputs.get('src/lib/SideBars/PageFoldBindingOverrides.svelte'), /task: 'otherAx'/)
    assert.match(plan.outputs.get('src/lib/SideBars/ModelBind.svelte'), /PageFoldBindingOverrides/)
    assert.match(plan.outputs.get('src/ts/storage/database.svelte.ts'), /normalizePageFoldRoleOverrides/)
    assert.doesNotMatch(plan.outputs.get('src/ts/pagefold/resolve.ts'), /setDatabase(?:Lite)?\s*\(/)
    assert.match(plan.outputs.get('src/ts/pagefold/serviceAccountImport.ts'), /262_144/)
    assert.match(plan.outputs.get('src/ts/pagefold/serviceAccountImport.ts'), /preset\.apiKeyRef = undefined/)
    assert.doesNotMatch(plan.outputs.get('src/ts/pagefold/serviceAccountImport.ts'), /addApiKey|apiKeyPool|plugins/)
    assert.match(plan.outputs.get('src/lib/Setting/Pages/Model/CredentialField.svelte'), /planServiceAccountFileImport/)
    assert.match(plan.outputs.get('src/ts/preset/adapter/googleServiceAccount/serviceAccount.ts'), /projectIdRaw/)
    assert.match(plan.outputs.get('src/ts/pagefold/pricing.ts'), /inputUsdPerMillion: 0\.75/)
    assert.match(plan.outputs.get('src/ts/pagefold/pricing.ts'), /2027-01-01T00:00:00\.000Z/)
    assert.match(plan.outputs.get('src/ts/pagefold/metrics.ts'), /signedTokenDelta/)
    assert.doesNotMatch(plan.outputs.get('src/ts/pagefold/metrics.ts'), /0\.050253/)
    assert.match(plan.outputs.get('src/ts/storage/database.svelte.ts'), /pageFold\?: import\('\.\.\/pagefold\/metrics'\)/)
    assert.match(plan.outputs.get('src/lib/Others/AlertComp.svelte'), /PageFoldGenerationInfo/)
    assert.match(plan.outputs.get('server/node/pageFoldRequestLogs.integration.test.ts'), /request-logs\.db redaction/)

    const byId = new Map(manifest.units.map((unit) => [unit.id, unit]))
    const reverted = new Map(plan.outputs)
    for (const id of [...plan.order].reverse()) {
        const unit = byId.get(id)
        reverted.set(unit.file, revertUnit(reverted.get(unit.file), unit))
    }
    for (const [file, baseline] of baselines) assert.equal(reverted.get(file), baseline, file)
})
