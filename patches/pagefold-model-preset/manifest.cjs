'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files-1.10')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu1100 = { pocketrisu: ['1.10.0'] }
const dependencyOwners = [
    'charx-archive-integrity:package-dependency:1.10',
    'charx-archive-integrity:lock-importer:1.10',
    'charx-archive-integrity:lock-package:1.10',
    'charx-archive-integrity:lock-snapshot:1.10',
    'haejeok-korean-search-adapter:package-dependency:1.10',
    'haejeok-korean-search-adapter:lock-importer:1.10',
    'haejeok-korean-search-adapter:lock-package:1.10',
    'haejeok-korean-search-adapter:lock-snapshot:1.10',
    'toolchain-hardening:package-lightningcss-override',
    'toolchain-hardening:lock-lightningcss-override',
    'toolchain-hardening:lock-lightningcss-packages',
    'toolchain-hardening:lock-tailwind-lightningcss',
    'toolchain-hardening:lock-lightningcss-snapshots',
    'toolchain-hardening:lock-vite-lightningcss',
]

module.exports = {
    id: 'pagefold-model-preset',
    title: 'PageFold ModelPreset transform',
    version: '0.1.0',
    source: 'Independent implementation; PageFold 0.1.1 behavioral reference only',
    targets: {
        pocketrisu: {
            verified: [],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: true,
    // Prototype-only. The manifest deliberately stays outside src/catalog.cjs
    // until independent extraction and paid route feasibility have passed.
    allDefault: false,
    units: [
        {
            id: 'pagefold-model-preset:package-fontkit:1.10',
            file: 'package.json',
            type: 'insert',
            where: 'after',
            anchor: `    "@mlc-ai/web-tokenizers": "^0.1.6",\n`,
            managed: `    "@pdf-lib/fontkit": "1.1.1",\n`,
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:package-pdf-lib:1.10',
            file: 'package.json',
            type: 'insert',
            where: 'after',
            anchor: `    "ollama": "^0.5.18",\n`,
            managed: `    "pdf-lib": "1.17.1",\n`,
            requires: ['pagefold-model-preset:package-fontkit:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-importer-fontkit:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'after',
            anchor: `      '@mlc-ai/web-tokenizers':
        specifier: ^0.1.6
        version: 0.1.6
`,
            managed: `      '@pdf-lib/fontkit':
        specifier: 1.1.1
        version: 1.1.1
`,
            requires: ['pagefold-model-preset:package-pdf-lib:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-importer-pdf-lib:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'after',
            anchor: `      ollama:
        specifier: ^0.5.18
        version: 0.5.18
`,
            managed: `      pdf-lib:
        specifier: 1.17.1
        version: 1.17.1
`,
            requires: ['pagefold-model-preset:lock-importer-fontkit:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-packages-pdf-lib-family:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  '@popperjs/core@2.11.8':
`,
            managed: `  '@pdf-lib/fontkit@1.1.1':
    resolution: {integrity: sha512-KjMd7grNapIWS/Dm0gvfHEilSyAmeLvrEGVcqLGi0VYebuqqzTbgF29efCx7tvx+IEbG3zQciRSWl3GkUSvjZg==}

  '@pdf-lib/standard-fonts@1.0.0':
    resolution: {integrity: sha512-hU30BK9IUN/su0Mn9VdlVKsWBS6GyhVfqjwl1FjZN4TxP6cCw0jP2w7V3Hf5uX7M0AZJ16vey9yE0ny7Sa59ZA==}

  '@pdf-lib/upng@1.0.1':
    resolution: {integrity: sha512-dQK2FUMQtowVP00mtIksrlZhdFXQZPC+taih1q4CvPZ5vqdxR/LKBaFg0oAfzd1GlHZXXSPdQfzQnt+ViGvEIQ==}

`,
            requires: ['pagefold-model-preset:lock-importer-pdf-lib:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-package-pako:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  parseurl@1.3.3:
`,
            managed: `  pako@1.0.11:
    resolution: {integrity: sha512-4hLB8Py4zZce5s4yd9XzopqwVv/yGNhV1Bl8NTmCq1763HeK2+EwVTv+leGeL13Dnh2wfbqowVPXCIO0z4taYw==}

`,
            requires: ['pagefold-model-preset:lock-packages-pdf-lib-family:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-package-pdf-lib:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  pdfjs-dist@4.10.38:
    resolution: {integrity: sha512-/Y3fcFrXEAsMjJXeL9J8+ZG9U01LbuWaYypvDW2ycW1jL269L3js3DVBjDJ0Up9Np1uqDXsDrRihHANhZOlwdQ==}
`,
            managed: `  pdf-lib@1.17.1:
    resolution: {integrity: sha512-V/mpyJAoTsN4cnP31vc0wfNA1+p20evqqnap0KLoRUN0Yk/p3wN52DOEsL4oBFcLdb76hlpKPtzJIgo67j/XLw==}

`,
            requires: ['pagefold-model-preset:lock-package-pako:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-package-tslib1:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  tslib@2.8.1:
`,
            managed: `  tslib@1.14.1:
    resolution: {integrity: sha512-Xni35NKzjgMrwevysHTCArtLDpPvye8zV/0E4EyYn43P7/7qvQwPh9BGkHewbMulVntbigmcT7rdX3BNo9wRJg==}

`,
            requires: ['pagefold-model-preset:lock-package-pdf-lib:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-snapshots-pdf-lib-family:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  '@popperjs/core@2.11.8': {}
`,
            managed: `  '@pdf-lib/fontkit@1.1.1':
    dependencies:
      pako: 1.0.11

  '@pdf-lib/standard-fonts@1.0.0':
    dependencies:
      pako: 1.0.11

  '@pdf-lib/upng@1.0.1':
    dependencies:
      pako: 1.0.11

`,
            requires: ['pagefold-model-preset:lock-package-tslib1:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-snapshot-pako:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  parseurl@1.3.3: {}
`,
            managed: `  pako@1.0.11: {}

`,
            requires: ['pagefold-model-preset:lock-snapshots-pdf-lib-family:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-snapshot-pdf-lib:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  pdfjs-dist@4.10.38:
    optionalDependencies:
      '@napi-rs/canvas': 0.1.86
`,
            managed: `  pdf-lib@1.17.1:
    dependencies:
      '@pdf-lib/standard-fonts': 1.0.0
      '@pdf-lib/upng': 1.0.1
      pako: 1.0.11
      tslib: 1.14.1

`,
            requires: ['pagefold-model-preset:lock-snapshot-pako:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lock-snapshot-tslib1:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  tslib@2.8.1: {}
`,
            managed: `  tslib@1.14.1: {}

`,
            requires: ['pagefold-model-preset:lock-snapshot-pdf-lib:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:canonical-transcript:1.10',
            file: 'src/ts/pagefold/canonicalTranscript.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/canonicalTranscript.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:canonical-transcript-tests:1.10',
            file: 'src/ts/pagefold/canonicalTranscript.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/canonicalTranscript.test.ts'),
            requires: ['pagefold-model-preset:canonical-transcript:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:font-cache:1.10',
            file: 'server/node/pageFoldFontCache.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldFontCache.cjs'),
            requires: ['pagefold-model-preset:lock-snapshot-tslib1:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:font-cache-tests:1.10',
            file: 'server/node/pageFoldFontCache.test.ts',
            type: 'owned',
            content: owned('server/node/pageFoldFontCache.test.ts'),
            requires: ['pagefold-model-preset:font-cache:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:pdf-worker:1.10',
            file: 'server/node/pageFoldPdfWorker.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldPdfWorker.cjs'),
            requires: ['pagefold-model-preset:font-cache-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:pdf-service:1.10',
            file: 'server/node/pageFoldPdfService.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldPdfService.cjs'),
            requires: ['pagefold-model-preset:pdf-worker:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:pdf-reader:1.10',
            file: 'server/node/pageFoldPdfReader.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldPdfReader.cjs'),
            requires: ['pagefold-model-preset:pdf-service:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:pdf-service-tests:1.10',
            file: 'server/node/pageFoldPdfService.test.ts',
            type: 'owned',
            content: owned('server/node/pageFoldPdfService.test.ts'),
            requires: [
                'pagefold-model-preset:canonical-transcript-tests:1.10',
                'pagefold-model-preset:pdf-reader:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:prototype-measure:1.10',
            file: 'server/node/pageFoldPrototypeMeasure.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldPrototypeMeasure.cjs'),
            requires: ['pagefold-model-preset:pdf-service-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:provider-feasibility:1.10',
            file: 'server/node/pageFoldProviderFeasibility.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldProviderFeasibility.cjs'),
            requires: ['pagefold-model-preset:prototype-measure:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:provider-feasibility-tests:1.10',
            file: 'server/node/pageFoldProviderFeasibility.test.ts',
            type: 'owned',
            content: owned('server/node/pageFoldProviderFeasibility.test.ts'),
            requires: ['pagefold-model-preset:provider-feasibility:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:structural-requalification:1.10',
            file: 'server/node/pageFoldStructuralRequalification.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldStructuralRequalification.cjs'),
            requires: ['pagefold-model-preset:provider-feasibility-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:structural-requalification-tests:1.10',
            file: 'server/node/pageFoldStructuralRequalification.test.ts',
            type: 'owned',
            content: owned('server/node/pageFoldStructuralRequalification.test.ts'),
            requires: ['pagefold-model-preset:structural-requalification:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:structural-paid-runner:1.10',
            file: 'server/node/pageFoldStructuralPaidRunner.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldStructuralPaidRunner.cjs'),
            requires: ['pagefold-model-preset:structural-requalification-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:structural-paid-runner-tests:1.10',
            file: 'server/node/pageFoldStructuralPaidRunner.test.ts',
            type: 'owned',
            content: owned('server/node/pageFoldStructuralPaidRunner.test.ts'),
            requires: ['pagefold-model-preset:structural-paid-runner:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:preset-pagefold-types:1.10',
            file: 'src/ts/preset/types.ts',
            type: 'insert',
            where: 'before',
            anchor: 'export interface ModelPreset {\n',
            content: `export type PageFoldMode = 'maximum' | 'balanced'
export type PageFoldRoleOverride = 'inherit' | 'on' | 'off'
export type PageFoldRoleOverrides = Partial<Record<ResolvedTask, PageFoldRoleOverride>>

export interface ModelPresetPageFoldConfig {
    enabled: boolean
    // Optional only for old/malformed persistence. Runtime blocks enabled
    // configs without an explicit mode instead of inferring hierarchy.
    mode?: PageFoldMode
    inputPriceOverride?: {
        usdPerMillion: number
        note?: string
        updatedAt: number
    }
}
`,
            requires: ['pagefold-model-preset:structural-paid-runner-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:preset-pagefold-field:1.10',
            file: 'src/ts/preset/types.ts',
            type: 'insert',
            where: 'after',
            anchor: '    maxContext?: number\n',
            content: `    // Optional ModelPreset transform. Absent/disabled preserves the
    // ordinary request graph; enabled requires an explicit hierarchy mode.
    pageFold?: ModelPresetPageFoldConfig
`,
            requires: ['pagefold-model-preset:preset-pagefold-types:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-pagefold-field:1.10',
            file: 'src/ts/preset/types.ts',
            type: 'insert',
            where: 'before',
            anchor: `}

/** A fully-normalized empty binding bundle`,
            content: `    // Per-logical-task transform override. Missing keys inherit the
    // selected preset; invalid persisted values are treated as inherit.
    pageFold?: PageFoldRoleOverrides
`,
            requires: ['pagefold-model-preset:preset-pagefold-field:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:qualified-route:1.10',
            file: 'src/ts/pagefold/qualifiedRoute.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/qualifiedRoute.ts'),
            requires: ['pagefold-model-preset:binding-pagefold-field:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:qualified-route-tests:1.10',
            file: 'src/ts/pagefold/qualifiedRoute.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/qualifiedRoute.test.ts'),
            requires: ['pagefold-model-preset:qualified-route:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:state-resolver:1.10',
            file: 'src/ts/pagefold/resolve.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/resolve.ts'),
            requires: ['pagefold-model-preset:qualified-route-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:state-resolver-tests:1.10',
            file: 'src/ts/pagefold/resolve.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/resolve.test.ts'),
            requires: ['pagefold-model-preset:state-resolver:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:db-defaults-normalizer-import:1.10',
            file: 'src/ts/preset/dbDefaults.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { loadBundledRegistry, getBundledRegistryId } from './registry/loader'\n",
            content: "import { normalizePageFoldConfig, normalizePageFoldRoleOverrides } from 'src/ts/pagefold/resolve'\n",
            requires: ['pagefold-model-preset:state-resolver-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:db-defaults-normalizer:1.10',
            file: 'src/ts/preset/dbDefaults.ts',
            type: 'insert',
            where: 'after',
            anchor: '    sanitizeModelPresetSnapshots(data.modelPresets)\n',
            content: `    for (const preset of data.modelPresets) {
        const normalized = normalizePageFoldConfig(preset.pageFold)
        if (normalized) preset.pageFold = normalized
        else delete preset.pageFold
    }
    if (data.defaultModelBinding) {
        const overrides = normalizePageFoldRoleOverrides(data.defaultModelBinding.pageFold)
        if (overrides) data.defaultModelBinding.pageFold = overrides
        else delete data.defaultModelBinding.pageFold
    }
`,
            requires: ['pagefold-model-preset:db-defaults-normalizer-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:db-default-binding-target-type:1.10',
            file: 'src/ts/preset/dbDefaults.ts',
            type: 'insert',
            where: 'after',
            anchor: '    modelPresets?: ModelPreset[]\n',
            content: "    defaultModelBinding?: import('./types').ModelBindingSet\n",
            requires: ['pagefold-model-preset:db-defaults-normalizer:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:render-port-types:1.10',
            file: 'src/ts/pagefold/renderPort.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/renderPort.ts'),
            requires: ['pagefold-model-preset:db-default-binding-target-type:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:http-render-port:1.10',
            file: 'src/ts/pagefold/httpRenderPort.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/httpRenderPort.ts'),
            requires: ['pagefold-model-preset:render-port-types:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:http-render-port-tests:1.10',
            file: 'src/ts/pagefold/httpRenderPort.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/httpRenderPort.test.ts'),
            requires: ['pagefold-model-preset:http-render-port:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:render-route:1.10',
            file: 'server/node/pageFoldRenderRoute.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldRenderRoute.cjs'),
            requires: ['pagefold-model-preset:http-render-port-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:render-route-tests:1.10',
            file: 'server/node/pageFoldRenderRoute.test.ts',
            type: 'owned',
            content: owned('server/node/pageFoldRenderRoute.test.ts'),
            requires: ['pagefold-model-preset:render-route:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:server-binary-body-limit:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `app.use((req, res, next) => {
    // Skip express.raw() for backup import — it must stream, not buffer into memory
    if (req.path === '/api/backup/import') return next();
    return express.raw({ type: 'application/octet-stream', limit: '2gb' })(req, res, next);
});`,
            content: `const pageFoldRawParser = express.raw({ type: 'application/octet-stream', limit: '2mb' });
app.use((req, res, next) => {
    // PageFold canonical input has an observed 2 MiB ceiling. Enforce it while
    // parsing so an oversized request is never buffered under the generic 2 GiB
    // binary-import allowance.
    if (req.path === '/api/pagefold/render') return pageFoldRawParser(req, res, next);
    // Skip express.raw() for backup import — it must stream, not buffer into memory
    if (req.path === '/api/backup/import') return next();
    return express.raw({ type: 'application/octet-stream', limit: '2gb' })(req, res, next);
});`,
            requires: ['pagefold-model-preset:render-route-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:server-render-route-registration:1.10',
            file: 'server/node/server.cjs',
            type: 'insert',
            where: 'after',
            anchor: "requestLogs.registerRoutes(app, { auth: checkAuth, activeSession: checkActiveSession });\n",
            content: `require('./pageFoldRenderRoute.cjs')(app, {
    checkAuth,
    checkActiveSession,
});
`,
            requires: ['pagefold-model-preset:server-binary-body-limit:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:production-directives:1.10',
            file: 'src/ts/pagefold/directives.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/directives.ts'),
            requires: ['pagefold-model-preset:server-render-route-registration:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:runtime-render-port:1.10',
            file: 'src/ts/pagefold/runtimePort.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/runtimePort.ts'),
            requires: ['pagefold-model-preset:production-directives:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:wire-prepare:1.10',
            file: 'src/ts/pagefold/prepare.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/prepare.ts'),
            requires: ['pagefold-model-preset:runtime-render-port:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:wire-prepare-tests:1.10',
            file: 'src/ts/pagefold/prepare.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/prepare.test.ts'),
            requires: ['pagefold-model-preset:wire-prepare:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:redaction:1.10',
            file: 'src/ts/pagefold/redaction.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/redaction.ts'),
            requires: ['pagefold-model-preset:wire-prepare-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:redaction-tests:1.10',
            file: 'src/ts/pagefold/redaction.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/redaction.test.ts'),
            requires: ['pagefold-model-preset:redaction:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:adapter-document-types:1.10',
            file: 'src/ts/preset/adapter/types.ts',
            type: 'insert',
            where: 'before',
            anchor: 'export interface AdapterChatMessage {\n',
            content: `export interface AdapterDocumentPart {
    kind: 'document'
    mime: 'application/pdf'
    filename: string
    bytes: Uint8Array
    pageCount: number
    byteLength: number
    sha256: string
    mediaResolution: 'low'
}

export interface AdapterPageFoldWireContext {
    routeProfileId: 'vertex-gemini-3.7-flash-low-v8'
    mode: import('../types').PageFoldMode
    directiveVersion: 1
    documentSha256: string
    pageCount: number
    pdfBytes: number
    outputReserve: number
    predictedWireInputTokens: number
    wireContextLimit: number
}
`,
            requires: ['pagefold-model-preset:redaction-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:adapter-document-field:1.10',
            file: 'src/ts/preset/adapter/types.ts',
            type: 'insert',
            where: 'after',
            anchor: "    images?: AdapterImagePart[]          // role:'user' — image attachments (vision)\n",
            content: `    // Internal binary documents. Only the explicit PageFold wire context
    // admits this field; ordinary adapters reject/ignore no document implicitly.
    documents?: AdapterDocumentPart[]
`,
            requires: ['pagefold-model-preset:adapter-document-types:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:adapter-pagefold-option:1.10',
            file: 'src/ts/preset/adapter/types.ts',
            type: 'insert',
            where: 'after',
            anchor: '    cache?: AdapterCacheContext\n',
            content: `    // Explicit invariant switch. A document field alone never activates
    // PageFold, keeping all ordinary callers on their existing wire.
    pageFold?: AdapterPageFoldWireContext
`,
            requires: ['pagefold-model-preset:adapter-document-field:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-wire-helper:1.10',
            file: 'src/ts/pagefold/geminiWire.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/geminiWire.ts'),
            requires: ['pagefold-model-preset:adapter-pagefold-option:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-pagefold-import:1.10',
            file: 'src/ts/preset/adapter/googleGemini.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { resolveWireModelId } from './wireInvariants'\n",
            content: `import {
    assertPageFoldGeminiInput,
    assertPreparedPageFoldGeminiBody,
    toPageFoldGeminiUserParts,
} from 'src/ts/pagefold/geminiWire'
`,
            requires: ['pagefold-model-preset:gemini-wire-helper:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-media-resolution-type:1.10',
            file: 'src/ts/preset/adapter/googleGemini.ts',
            type: 'insert',
            where: 'after',
            anchor: '    inlineData?: { mimeType: string; data: string }\n',
            content: "    mediaResolution?: { level: 'MEDIA_RESOLUTION_LOW' }\n",
            requires: ['pagefold-model-preset:gemini-pagefold-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-input-invariant:1.10',
            file: 'src/ts/preset/adapter/googleGemini.ts',
            type: 'insert',
            where: 'after',
            anchor: '    delete prepared.body.model\n',
            content: `
    if (options.pageFold) {
        assertPageFoldGeminiInput(preset, options.messages, options.pageFold, {
            toolsPresent: (options.tools?.length ?? 0) > 0,
            cachePresent: options.cache !== undefined,
        })
    } else if (options.messages.some((message) => (message.documents?.length ?? 0) > 0)) {
        throw new ModelPresetAdapterError('invalid-request', 'Document input requires an explicit PageFold wire context', {
            retryable: false,
            fallbackEligible: false,
        })
    }
`,
            requires: ['pagefold-model-preset:gemini-media-resolution-type:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-contents-context:1.10',
            file: 'src/ts/preset/adapter/googleGemini.ts',
            type: 'replace',
            anchor: '    const { contents, cacheBoundary } = toGeminiContents(chat)\n',
            content: '    const { contents, cacheBoundary } = toGeminiContents(chat, options.pageFold)\n',
            requires: ['pagefold-model-preset:gemini-input-invariant:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-final-invariant:1.10',
            file: 'src/ts/preset/adapter/googleGemini.ts',
            type: 'insert',
            where: 'before',
            anchor: "    const suffix = stream ? ':streamGenerateContent?alt=sse' : ':generateContent'\n",
            content: `    if (options.pageFold) {
        assertPreparedPageFoldGeminiBody(prepared.body, options.pageFold)
    }

`,
            requires: ['pagefold-model-preset:gemini-contents-context:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-contents-signature:1.10',
            file: 'src/ts/preset/adapter/googleGemini.ts',
            type: 'replace',
            anchor: `function toGeminiContents(chat: AdapterChatMessage[]): {
    contents: GeminiContent[]
    cacheBoundary: number | null
} {`,
            content: `function toGeminiContents(
    chat: AdapterChatMessage[],
    pageFold: AdapterChatOptions['pageFold'],
): {
    contents: GeminiContent[]
    cacheBoundary: number | null
} {`,
            requires: ['pagefold-model-preset:gemini-final-invariant:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-user-parts-call:1.10',
            file: 'src/ts/preset/adapter/googleGemini.ts',
            type: 'replace',
            anchor: "            out.push({ role: 'user', parts: toUserParts(message) })\n",
            content: "            out.push({ role: 'user', parts: toUserParts(message, pageFold) })\n",
            requires: ['pagefold-model-preset:gemini-contents-signature:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-user-parts-document:1.10',
            file: 'src/ts/preset/adapter/googleGemini.ts',
            type: 'replace',
            anchor: `function toUserParts(message: AdapterChatMessage): GeminiPart[] {
    const parts: GeminiPart[] = []`,
            content: `function toUserParts(
    message: AdapterChatMessage,
    pageFold: AdapterChatOptions['pageFold'],
): GeminiPart[] {
    if (pageFold) return toPageFoldGeminiUserParts(message, pageFold)
    const parts: GeminiPart[] = []`,
            requires: ['pagefold-model-preset:gemini-user-parts-call:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-context-type:1.10',
            file: 'src/ts/process/request/modelPresetBinding.ts',
            type: 'insert',
            where: 'after',
            anchor: "    | { kind: 'block'; reason: 'main-unset' | 'sub-unset' }\n",
            content: `
export type ResolvedBindingWithContext =
    | Exclude<ResolvedBinding, { kind: 'modelPreset' }>
    | {
        kind: 'modelPreset'
        preset: ModelPreset
        bindingSource: 'chat' | 'global-lock-default' | 'module'
        pageFoldBinding?: import('src/ts/preset/types').ModelBindingSet
    }
`,
            requires: ['pagefold-model-preset:gemini-user-parts-document:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-context-detailed-name:1.10',
            file: 'src/ts/process/request/modelPresetBinding.ts',
            type: 'replace',
            anchor: `export function resolveChatModelBinding(
    chat: Chat | null | undefined,
    mode: ModelModeExtended,
    moduleId?: string,
): ResolvedBinding {`,
            content: `export function resolveChatModelBindingWithContext(
    chat: Chat | null | undefined,
    mode: ModelModeExtended,
    moduleId?: string,
): ResolvedBindingWithContext {`,
            requires: ['pagefold-model-preset:binding-context-type:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-context-compatible-wrapper:1.10',
            file: 'src/ts/process/request/modelPresetBinding.ts',
            type: 'insert',
            where: 'before',
            anchor: 'export function resolveChatModelBinding(\n',
            content: `export function resolveChatModelBinding(chat: Chat | null | undefined, mode: ModelModeExtended, moduleId?: string): ResolvedBinding {
    const resolved = resolveChatModelBindingWithContext(chat, mode, moduleId)
    return resolved.kind === 'modelPreset'
        ? { kind: 'modelPreset', preset: resolved.preset }
        : resolved
}

`,
            requires: ['pagefold-model-preset:binding-context-type:1.10'],
            before: ['pagefold-model-preset:binding-context-detailed-name:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-context-module:1.10',
            file: 'src/ts/process/request/modelPresetBinding.ts',
            type: 'replace',
            anchor: "        if (bound) return { kind: 'modelPreset', preset: bound }\n",
            content: "        if (bound) return { kind: 'modelPreset', preset: bound, bindingSource: 'module' }\n",
            requires: [
                'pagefold-model-preset:binding-context-detailed-name:1.10',
                'pagefold-model-preset:binding-context-compatible-wrapper:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-context-source:1.10',
            file: 'src/ts/process/request/modelPresetBinding.ts',
            type: 'insert',
            where: 'after',
            anchor: `    if (!set) {
        return { kind: 'block', reason: mode === 'model' ? 'main-unset' : 'sub-unset' }
    }
`,
            content: `    const bindingSource = set === chat?.modelBinding ? 'chat' : 'global-lock-default'
`,
            requires: ['pagefold-model-preset:binding-context-module:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-context-main:1.10',
            file: 'src/ts/process/request/modelPresetBinding.ts',
            type: 'replace',
            anchor: `        return main
            ? { kind: 'modelPreset', preset: main }
            : { kind: 'block', reason: 'main-unset' }
`,
            content: `        return main
            ? { kind: 'modelPreset', preset: main, bindingSource, pageFoldBinding: set }
            : { kind: 'block', reason: 'main-unset' }
`,
            requires: ['pagefold-model-preset:binding-context-source:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-context-aux:1.10',
            file: 'src/ts/process/request/modelPresetBinding.ts',
            type: 'replace',
            anchor: "        if (auxPreset) return { kind: 'modelPreset', preset: auxPreset }\n",
            content: "        if (auxPreset) return { kind: 'modelPreset', preset: auxPreset, bindingSource, pageFoldBinding: set }\n",
            requires: ['pagefold-model-preset:binding-context-main:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-context-sub:1.10',
            file: 'src/ts/process/request/modelPresetBinding.ts',
            type: 'replace',
            anchor: `    return sub
        ? { kind: 'modelPreset', preset: sub }
        : { kind: 'block', reason: 'sub-unset' }
`,
            content: `    return sub
        ? { kind: 'modelPreset', preset: sub, bindingSource, pageFoldBinding: set }
        : { kind: 'block', reason: 'sub-unset' }
`,
            requires: ['pagefold-model-preset:binding-context-aux:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:budget-policy:1.10',
            file: 'src/ts/pagefold/budget.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/budget.ts'),
            requires: ['pagefold-model-preset:binding-context-sub:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:budget-policy-tests:1.10',
            file: 'src/ts/pagefold/budget.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/budget.test.ts'),
            requires: ['pagefold-model-preset:budget-policy:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:failure-policy:1.10',
            file: 'src/ts/pagefold/failurePolicy.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/failurePolicy.ts'),
            requires: ['pagefold-model-preset:budget-policy-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:failure-policy-tests:1.10',
            file: 'src/ts/pagefold/failurePolicy.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/failurePolicy.test.ts'),
            requires: ['pagefold-model-preset:failure-policy:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:chat-tokenizer-encoder-field:1.10',
            file: 'src/ts/tokenizer.ts',
            type: 'insert',
            where: 'after',
            anchor: "    private useName:'name'|'noName'\n",
            content: `    private encodeText: typeof encode
`,
            requires: ['pagefold-model-preset:failure-policy-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:chat-tokenizer-encoder-constructor:1.10',
            file: 'src/ts/tokenizer.ts',
            type: 'replace',
            anchor: `    constructor(chatAdditionalTokens:number, useName:'name'|'noName'){
        this.chatAdditionalTokens = chatAdditionalTokens
        this.useName = useName
    }
`,
            content: `    constructor(
        chatAdditionalTokens: number,
        useName: 'name' | 'noName',
        encodeText: typeof encode = encode,
    ) {
        this.chatAdditionalTokens = chatAdditionalTokens
        this.useName = useName
        this.encodeText = encodeText
    }
`,
            requires: ['pagefold-model-preset:chat-tokenizer-encoder-field:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:chat-tokenizer-content-encoder:1.10',
            file: 'src/ts/tokenizer.ts',
            type: 'replace',
            anchor: '        let encoded = (await encode(data.content)).length + this.chatAdditionalTokens\n',
            content: '        let encoded = (await this.encodeText(data.content)).length + this.chatAdditionalTokens\n',
            requires: ['pagefold-model-preset:chat-tokenizer-encoder-constructor:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:chat-tokenizer-name-encoder:1.10',
            file: 'src/ts/tokenizer.ts',
            type: 'replace',
            anchor: '            encoded += (await encode(data.name)).length + 1\n',
            content: '            encoded += (await this.encodeText(data.name)).length + 1\n',
            requires: ['pagefold-model-preset:chat-tokenizer-content-encoder:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:chat-tokenizer-thought-encoder:1.10',
            file: 'src/ts/tokenizer.ts',
            type: 'replace',
            anchor: '                encoded += (await encode(thought)).length + 1\n',
            content: '                encoded += (await this.encodeText(thought)).length + 1\n',
            requires: ['pagefold-model-preset:chat-tokenizer-name-encoder:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-pagefold-imports:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'insert',
            where: 'after',
            anchor: `import {
    startStatus, appendText, endStatus, setStatusTokenCounter, addBadge,
    type RequestKind,
} from "src/ts/status/requestStatus";
`,
            content: `import { resolvePageFoldState } from 'src/ts/pagefold/resolve'
import { preparePageFoldWire } from 'src/ts/pagefold/prepare'
import { getPageFoldRuntimeRenderPort } from 'src/ts/pagefold/runtimePort'
import { redactPreparedRequestForDisplay } from 'src/ts/pagefold/redaction'
import {
    assertPageFoldCanonicalSourceBudget,
    countPageFoldAdapterSourceTokens,
    resolvePageFoldOutputReserve,
    resolvePageFoldSourceBudget,
} from 'src/ts/pagefold/budget'
import {
    completePageFoldRouteState,
    createPageFoldSourceRouteState,
    pageFoldContentRetryPolicy,
    pageFoldFailurePolicy,
    validatePageFoldRouteState,
    type PageFoldRouteState,
    type RequestFailurePolicy,
} from 'src/ts/pagefold/failurePolicy'
import type { ResolvedBindingWithContext } from './modelPresetBinding'
`,
            requires: ['pagefold-model-preset:chat-tokenizer-thought-encoder:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-route-state-argument:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'insert',
            where: 'after',
            anchor: '    logSource?:RequestLogSource\n',
            content: `    /** Runtime-only exact source/PDF reuse. Never persisted or sent to BG result state. */
    pageFoldRouteState?: PageFoldRouteState
`,
            requires: ['pagefold-model-preset:request-pagefold-imports:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-route-state-response:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'insert',
            where: 'after',
            anchor: '    noRetry?: boolean,\n',
            content: `    pageFoldRouteState?: PageFoldRouteState
    failurePolicy?: RequestFailurePolicy
`,
            requires: ['pagefold-model-preset:request-route-state-argument:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-route-state-stream-response:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'insert',
            where: 'after',
            anchor: '    result: ReadableStream<StreamResponseChunk>,\n',
            content: `    pageFoldRouteState?: PageFoldRouteState
    failurePolicy?: RequestFailurePolicy
`,
            requires: ['pagefold-model-preset:request-route-state-response:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-outer-route-state:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'insert',
            where: 'after',
            anchor: '    let da:requestDataResponse\n',
            content: `    let pageFoldRouteState: PageFoldRouteState | undefined
`,
            requires: ['pagefold-model-preset:request-route-state-stream-response:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-outer-skip-source-transforms:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: `            if(pluginV2.replacerbeforeRequest.size > 0){
                for(const replacer of pluginV2.replacerbeforeRequest){
                    arg.formated = await replacer(arg.formated, model)
                }
            }
${'            '}
            try{
                const currentChar = getCurrentCharacter()
                if(currentChar){
                    const perf = performance.now()
                    const d = await runTrigger(currentChar, 'request', {
                        chat: getCurrentChat(),
                        displayMode: true,
                        displayData: JSON.stringify(arg.formated)
                    })
${'        '}
                    const got = JSON.parse(d.displayData)
                    if(!got || !Array.isArray(got)){
                        throw new Error('Invalid return')
                    }
                    arg.formated = got
                    console.log('Trigger time', performance.now() - perf)
                }
            }
            catch(e){
                console.error(e)
            }
`,
            content: `            if(!pageFoldRouteState){
                if(pluginV2.replacerbeforeRequest.size > 0){
                    for(const replacer of pluginV2.replacerbeforeRequest){
                        arg.formated = await replacer(arg.formated, model)
                    }
                }

                try{
                    const currentChar = getCurrentCharacter()
                    if(currentChar){
                        const perf = performance.now()
                        const d = await runTrigger(currentChar, 'request', {
                            chat: getCurrentChat(),
                            displayMode: true,
                            displayData: JSON.stringify(arg.formated)
                        })

                        const got = JSON.parse(d.displayData)
                        if(!got || !Array.isArray(got)){
                            throw new Error('Invalid return')
                        }
                        arg.formated = got
                        console.log('Trigger time', performance.now() - perf)
                    }
                }
                catch(e){
                    console.error(e)
                }
            }
`,
            requires: ['pagefold-model-preset:request-outer-route-state:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-outer-pass-route-state:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: `                ...arg,
                staticModel: fallBackModels[fallbackIndex],
`,
            content: `                ...arg,
                pageFoldRouteState,
                staticModel: fallBackModels[fallbackIndex],
`,
            requires: ['pagefold-model-preset:request-outer-skip-source-transforms:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-outer-capture-route-state:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'insert',
            where: 'after',
            anchor: '            }, model, abortSignal)\n',
            content: `            if (da.pageFoldRouteState) pageFoldRouteState = da.pageFoldRouteState
`,
            requires: ['pagefold-model-preset:request-outer-pass-route-state:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-outer-charset-policy:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: `                if(failed){
                    continue
                }
`,
            content: `                if(failed){
                    if (pageFoldRouteState && trys > db.requestRetrys) {
                        return {
                            type: 'fail', result: 'PageFold response contained a banned charset',
                            model: da.model, noRetry: true, pageFoldRouteState,
                            failurePolicy: pageFoldContentRetryPolicy('banned-charset'),
                        }
                    }
                    continue
                }
`,
            requires: ['pagefold-model-preset:request-outer-capture-route-state:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-outer-blank-policy:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'insert',
            where: 'before',
            anchor: "            if(da.type === 'success' && fallbackIndex !== fallBackModels.length-1 && db.fallbackWhenBlankResponse){\n",
            content: `            if(da.type === 'success' && pageFoldRouteState && db.fallbackWhenBlankResponse && da.result.trim() === ''){
                trys += 1
                if (trys > db.requestRetrys) {
                    return {
                        type: 'fail', result: 'PageFold returned a blank response',
                        model: da.model, noRetry: true, pageFoldRouteState,
                        failurePolicy: pageFoldContentRetryPolicy('blank-response'),
                    }
                }
                continue
            }

`,
            requires: ['pagefold-model-preset:request-outer-charset-policy:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-outer-failure-policy:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'insert',
            where: 'before',
            anchor: "            if(da.type !== 'fail' || da.noRetry){\n",
            content: `            if(da.type === 'fail' && da.failurePolicy){
                if (da.failurePolicy.allowClassicFallback !== false) {
                    return { ...da, noRetry: true, result: 'Invalid PageFold fallback policy' }
                }
                if (da.failurePolicy.retrySameRoute && pageFoldRouteState && trys < db.requestRetrys) {
                    trys += 1
                    if (da.failurePolicy.retryAfterMs) await sleep(da.failurePolicy.retryAfterMs)
                    continue
                }
                return da
            }

`,
            requires: ['pagefold-model-preset:request-outer-blank-policy:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-detailed-binding-import:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: "import { resolveChatModelBinding, buildModelPresetCredential, applyPromptPresetParams } from \"./modelPresetBinding\";\n",
            content: "import { resolveChatModelBinding, resolveChatModelBindingWithContext, resolvePresetMaxOutputTokens, buildModelPresetCredential, applyPromptPresetParams } from \"./modelPresetBinding\";\n",
            requires: ['pagefold-model-preset:request-outer-failure-policy:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-detailed-binding-call:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: '        const binding = resolveChatModelBinding(currentChat, model, arg.moduleId)\n',
            content: '        const binding = resolveChatModelBindingWithContext(currentChat, model, arg.moduleId)\n',
            requires: ['pagefold-model-preset:request-detailed-binding-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-preset-binding-context:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: "            return requestModelPreset(targ, applyPromptPresetParams(binding.preset, currentChat, model), abortSignal, model)\n",
            content: "            return requestModelPreset(targ, applyPromptPresetParams(binding.preset, currentChat, model), abortSignal, model, binding)\n",
            requires: ['pagefold-model-preset:request-detailed-binding-call:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-preset-signature:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: "async function requestModelPreset(arg:RequestDataArgumentExtended, preset:ModelPreset, abortSignal:AbortSignal=null, mode:ModelModeExtended='model'):Promise<requestDataResponse> {\n",
            content: `async function requestModelPreset(
    arg: RequestDataArgumentExtended,
    preset: ModelPreset,
    abortSignal: AbortSignal = null,
    mode: ModelModeExtended = 'model',
    bindingContext?: Extract<ResolvedBindingWithContext, { kind: 'modelPreset' }>,
): Promise<requestDataResponse> {
`,
            requires: ['pagefold-model-preset:request-preset-binding-context:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-retry-skip-reformater:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: `    try {
        arg.formated = reformater(safeStructuredClone(arg.formated), presetFlags)
    } catch (err) {
        return { type: 'fail', result: err instanceof Error ? err.message : String(err), model: wireModel }
    }
`,
            content: `    if (!arg.pageFoldRouteState) {
        try {
            arg.formated = reformater(safeStructuredClone(arg.formated), presetFlags)
        } catch (err) {
            return { type: 'fail', result: err instanceof Error ? err.message : String(err), model: wireModel }
        }
    }
`,
            requires: ['pagefold-model-preset:request-preset-signature:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-mutable-messages:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: `    const messages = tools
        ? await expandAdapterMessages(arg.formated, decodeToolCall, supportsVision)
        : arg.formated.map((m) => toAdapterMessage(m, supportsVision))
`,
            content: `    let messages = arg.pageFoldRouteState
        ? [...arg.pageFoldRouteState.sourceMessages]
        : tools
            ? await expandAdapterMessages(arg.formated, decodeToolCall, supportsVision)
            : arg.formated.map((m) => toAdapterMessage(m, supportsVision))
`,
            requires: ['pagefold-model-preset:request-retry-skip-reformater:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-prepare-wire:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'insert',
            where: 'after',
            anchor: `    const messages = tools
        ? await expandAdapterMessages(arg.formated, decodeToolCall, supportsVision)
        : arg.formated.map((m) => toAdapterMessage(m, supportsVision))
`,
            content: `
    const pageFoldState = resolvePageFoldState({
        preset,
        task: mode,
        binding: bindingContext?.pageFoldBinding,
        moduleBound: bindingContext?.bindingSource === 'module',
    })
    let pageFoldContext: AdapterChatOptions['pageFold']
    let pageFoldRouteState = arg.pageFoldRouteState
    let pageFoldStatusStarted = false
    const bindingSource = bindingContext?.bindingSource ?? 'chat'
    const bindingModuleId = bindingSource === 'module' ? arg.moduleId : undefined

    if (pageFoldRouteState && pageFoldState.kind !== 'on') {
        void logScope.close()
        return {
            type: 'fail',
            result: 'PageFold retry state is no longer enabled by the live preset',
            model: wireModel,
            noRetry: true,
            pageFoldRouteState,
            failurePolicy: pageFoldFailurePolicy({}, 'support-evidence'),
        }
    }
    if (pageFoldState.kind === 'blocked') {
        void logScope.close()
        return {
            type: 'fail',
            result: 'PageFold blocked: ' + pageFoldState.reason,
            model: wireModel,
            noRetry: true,
            failurePolicy: pageFoldFailurePolicy({}, 'support-evidence'),
        }
    }
    if (pageFoldState.kind === 'on') {
        const pageFoldOperationStartedAt = pageFoldRouteState?.operationStartedAt ?? Date.now()
        const incompatible = preset.toolUse === true
            ? 'tools-enabled'
            : preset.promptCaching?.enabled === true
                ? 'explicit-cache-enabled'
                : messages.some((message) => (message.images?.length ?? 0) > 0)
                    ? 'image-present'
                    : null
        if (incompatible) {
            void logScope.close()
            return {
                type: 'fail',
                result: 'PageFold blocked: ' + incompatible,
                model: wireModel,
                noRetry: true,
                failurePolicy: pageFoldFailurePolicy({}, 'prepared-invariant'),
            }
        }
        if (reportStatus) {
            safeStatus(() => startStatus(genId, {
                kind: statusKind,
                label: preset.name + ' · PageFold',
                chatId: arg.realChatId,
                phase: 'connecting',
                now: pageFoldOperationStartedAt,
            }))
            pageFoldStatusStarted = true
        }
        try {
            if (pageFoldRouteState) {
                validatePageFoldRouteState({
                    state: pageFoldRouteState,
                    preset,
                    task: mode,
                    mode: pageFoldState.mode,
                    bindingSource,
                    moduleId: bindingModuleId,
                })
                messages = [...pageFoldRouteState.sourceMessages]
            } else {
                const outputReserve = resolvePageFoldOutputReserve(
                    preset,
                    resolvePresetMaxOutputTokens(preset),
                    getDatabase().maxResponse,
                )
                const sourceBudget = resolvePageFoldSourceBudget({
                    preset,
                    outputReserve,
                    databaseTokenizer: getDatabase().customTokenizer,
                })
                pageFoldRouteState = createPageFoldSourceRouteState({
                    preset,
                    task: mode,
                    mode: pageFoldState.mode,
                    bindingSource,
                    moduleId: bindingModuleId,
                    sourceMessages: messages,
                    sourceBudget,
                    operationStartedAt: pageFoldOperationStartedAt,
                })
            }

            if (pageFoldRouteState.stage === 'rendered') {
                messages = [...pageFoldRouteState.wireMessages]
                pageFoldContext = { ...pageFoldRouteState.wireContext }
            } else {
                const canonicalSourceTokenEstimate = await countPageFoldAdapterSourceTokens(
                    pageFoldRouteState.sourceMessages,
                    pageFoldRouteState.sourceBudget.sourceTokenizer,
                )
                assertPageFoldCanonicalSourceBudget(canonicalSourceTokenEstimate, pageFoldRouteState.sourceBudget)
                const preparedPageFold = await preparePageFoldWire({
                    state: pageFoldState,
                    preset,
                    task: mode,
                    binding: { source: bindingSource, ...(bindingModuleId ? { moduleId: bindingModuleId } : {}) },
                    messages: pageFoldRouteState.sourceMessages,
                    renderPort: getPageFoldRuntimeRenderPort(),
                    sourceBudget: pageFoldRouteState.sourceBudget,
                    canonicalSourceTokenEstimate,
                    signal: abortSignal ?? undefined,
                })
                messages = preparedPageFold.messages
                pageFoldContext = preparedPageFold.context
                pageFoldRouteState = completePageFoldRouteState(
                    pageFoldRouteState,
                    preparedPageFold,
                    preparedPageFold.budget,
                )
            }
        } catch (err) {
            if (pageFoldStatusStarted) safeStatus(() => endStatus(genId, abortSignal?.aborted ? 'aborted' : 'failed', {
                now: Date.now(),
                error: err instanceof Error ? err.message : String(err),
            }))
            void logScope.close()
            return {
                type: 'fail',
                result: err instanceof Error ? err.message : String(err),
                model: wireModel,
                noRetry: true,
                pageFoldRouteState,
                failurePolicy: pageFoldFailurePolicy(err, 'renderer'),
            }
        }
    }
`,
            requires: ['pagefold-model-preset:request-preset-signature:1.10'],
            before: ['pagefold-model-preset:request-mutable-messages:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-preview-redaction:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: `    if (arg.previewBody) {
        try {
            // Mirror the real request's options so the preview shows the body that
            // would actually be sent (cache breakpoints included).
            const prepared = await previewModelPreset(kind, preset, {
                messages, tools, fetchImpl,
                anthropicCache1h: getDatabase().claude1HourCaching === true,
            }, credential)
            return {
                type: 'success',
                result: JSON.stringify({ url: prepared.url, body: prepared.body, headers: prepared.headers }),
                model: wireModel,
            }
        } catch (err) {
            return { type: 'fail', result: err instanceof Error ? err.message : String(err), model: wireModel }
        } finally {
            void logScope.close()
        }
    }
`,
            content: `    if (arg.previewBody) {
        let previewOutcome: 'done' | 'failed' = 'done'
        let previewError: string | undefined
        try {
            // Mirror the real request's options so preview and send execute the
            // same final prepared invariant; redact only the display copy.
            const prepared = await previewModelPreset(kind, preset, {
                messages, tools, fetchImpl, pageFold: pageFoldContext,
                anthropicCache1h: getDatabase().claude1HourCaching === true,
            }, credential)
            return {
                type: 'success',
                result: JSON.stringify(redactPreparedRequestForDisplay(prepared)),
                model: wireModel,
            }
        } catch (err) {
            previewOutcome = 'failed'
            previewError = err instanceof Error ? err.message : String(err)
            return { type: 'fail', result: previewError, model: wireModel, noRetry: pageFoldContext ? true : undefined }
        } finally {
            if (pageFoldStatusStarted) safeStatus(() => endStatus(genId, previewOutcome, {
                now: Date.now(),
                error: previewError,
            }))
            void logScope.close()
        }
    }
`,
            requires: ['pagefold-model-preset:request-prepare-wire:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-options-context:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: '            messages, abortSignal: abortSignal ?? undefined, fetchImpl, generationId: genId, cache,\n',
            content: '            messages, abortSignal: abortSignal ?? undefined, fetchImpl, generationId: genId, cache, pageFold: pageFoldContext,\n',
            requires: ['pagefold-model-preset:request-preview-redaction:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-status-no-restart:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: '        if (reportStatus) {\n            safeStatus(() => startStatus(genId, { kind: statusKind, label: preset.name, chatId: arg.realChatId, phase: \'connecting\', now: Date.now() }))\n        }\n',
            content: `        if (reportStatus && !pageFoldStatusStarted) {
            safeStatus(() => startStatus(genId, { kind: statusKind, label: preset.name, chatId: arg.realChatId, phase: 'connecting', now: Date.now() }))
        }
`,
            requires: ['pagefold-model-preset:request-options-context:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-decoupled-route-state:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: "                return { type: 'success', result: text, model: wireModel }\n",
            content: "                return { type: 'success', result: text, model: wireModel, pageFoldRouteState }\n",
            requires: ['pagefold-model-preset:request-status-no-restart:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-stream-route-state:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: "            return { type: 'streaming', result: stream, model: wireModel }\n",
            content: "            return { type: 'streaming', result: stream, model: wireModel, pageFoldRouteState }\n",
            requires: ['pagefold-model-preset:request-decoupled-route-state:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-success-route-state:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: "        return { type: 'success', result: formatPresetReasoning(response.reasoning) + response.text, model: wireModel }\n",
            content: "        return { type: 'success', result: formatPresetReasoning(response.reasoning) + response.text, model: wireModel, pageFoldRouteState }\n",
            requires: ['pagefold-model-preset:request-stream-route-state:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-failure-route-policy:1.10',
            file: 'src/ts/process/request/request.ts',
            type: 'replace',
            anchor: `        return {
            type: 'fail',
            result: err instanceof Error ? err.message : String(err),
            model: wireModel,
        }
`,
            content: `        return {
            type: 'fail',
            result: err instanceof Error ? err.message : String(err),
            model: wireModel,
            noRetry: pageFoldRouteState ? true : undefined,
            pageFoldRouteState,
            failurePolicy: pageFoldRouteState ? pageFoldFailurePolicy(err) : undefined,
        }
`,
            requires: ['pagefold-model-preset:request-success-route-state:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-log-redaction-import:1.10',
            file: 'src/ts/requestLog.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { getClientId } from './log'\n",
            content: `import {
    redactRequestLogBody,
    redactRequestLogHeaders,
    redactRequestLogUrl,
} from 'src/ts/pagefold/redaction'
`,
            requires: ['pagefold-model-preset:request-failure-route-policy:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-log-media-redaction:1.10',
            file: 'src/ts/requestLog.ts',
            type: 'replace',
            anchor: `function stripInlineMedia(body: string): string {
    return body.replace(
        /"data:([a-z]+)\\/([a-z0-9.+-]+);base64,[A-Za-z0-9+/=]+"/gi,
        (match, type: string, subtype: string) =>
            \`"[\${type}/\${subtype}: \${Math.round(match.length * 0.75 / 1024)} KB omitted]"\`,
    )
}`,
            content: `function stripInlineMedia(body: string): string {
    return redactRequestLogBody(body) ?? ''
}`,
            requires: ['pagefold-model-preset:request-log-redaction-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-log-header-redaction:1.10',
            file: 'src/ts/requestLog.ts',
            type: 'replace',
            anchor: `function headersToString(headers: unknown): string | undefined {
    if (!headers) return undefined
    try {
        if (headers instanceof Headers) {
            return JSON.stringify(Object.fromEntries(headers.entries()))
        }
        return JSON.stringify(headers)
    } catch {
        return undefined
    }
}`,
            content: `function headersToString(headers: unknown): string | undefined {
    return redactRequestLogHeaders(headers)
}`,
            requires: ['pagefold-model-preset:request-log-media-redaction:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:request-log-url-redaction:1.10',
            file: 'src/ts/requestLog.ts',
            type: 'replace',
            anchor: "            const url = typeof input === 'string' ? input : input.toString()\n",
            content: "            const url = redactRequestLogUrl(typeof input === 'string' ? input : input.toString())\n",
            requires: ['pagefold-model-preset:request-log-header-redaction:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:server-log-redaction-helper:1.10',
            file: 'server/node/pageFoldRequestLogRedaction.cjs',
            type: 'owned',
            content: owned('server/node/pageFoldRequestLogRedaction.cjs'),
            requires: ['pagefold-model-preset:request-log-url-redaction:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:server-log-redaction-import:1.10',
            file: 'server/node/request-logs.cjs',
            type: 'insert',
            where: 'after',
            anchor: "const { maskSensitive } = require('./logs.cjs');\n",
            content: "const { redactPageFoldRequestLogText } = require('./pageFoldRequestLogRedaction.cjs');\n",
            requires: ['pagefold-model-preset:server-log-redaction-helper:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:server-log-redaction-tests:1.10',
            file: 'server/node/pageFoldRequestLogRedaction.test.ts',
            type: 'owned',
            content: owned('server/node/pageFoldRequestLogRedaction.test.ts'),
            requires: ['pagefold-model-preset:server-log-redaction-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:server-log-request-body-redaction:1.10',
            file: 'server/node/request-logs.cjs',
            type: 'replace',
            anchor: "        ? truncateBody(maskSensitive(String(entry.requestBody)), MAX_BODY_BYTES)\n",
            content: "        ? truncateBody(maskSensitive(redactPageFoldRequestLogText(entry.requestBody)), MAX_BODY_BYTES)\n",
            requires: ['pagefold-model-preset:server-log-redaction-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:server-log-response-body-redaction:1.10',
            file: 'server/node/request-logs.cjs',
            type: 'replace',
            anchor: "        ? truncateTail(maskSensitive(String(entry.responseBody)), MAX_BODY_BYTES)\n",
            content: "        ? truncateTail(maskSensitive(redactPageFoldRequestLogText(entry.responseBody)), MAX_BODY_BYTES)\n",
            requires: ['pagefold-model-preset:server-log-request-body-redaction:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:gemini-wire-integration-tests:1.10',
            file: 'src/ts/pagefold/geminiWire.integration.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/geminiWire.integration.test.ts'),
            requires: ['pagefold-model-preset:server-log-response-body-redaction:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:index-tokenizer-import:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'replace',
            anchor: 'import { ChatTokenizer, tokenize, tokenizeNum } from "../tokenizer";\n',
            content: 'import { ChatTokenizer, encodeWithTokenizer, tokenize, tokenizeNum } from "../tokenizer";\n',
            requires: ['pagefold-model-preset:gemini-wire-integration-tests:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:index-binding-import:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'replace',
            anchor: 'import { resolveChatModelBinding, resolvePresetMaxOutputTokens } from "./request/modelPresetBinding";\n',
            content: 'import { resolveChatModelBinding, resolveChatModelBindingWithContext, resolvePresetMaxOutputTokens } from "./request/modelPresetBinding";\n',
            requires: ['pagefold-model-preset:index-tokenizer-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:index-budget-import:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { resolveChatModelBinding, resolvePresetMaxOutputTokens } from "./request/modelPresetBinding";\n',
            content: `import { resolvePageFoldState } from 'src/ts/pagefold/resolve'
import { resolvePageFoldOutputReserve, resolvePageFoldSourceBudget } from 'src/ts/pagefold/budget'
`,
            requires: ['pagefold-model-preset:index-tokenizer-import:1.10'],
            before: ['pagefold-model-preset:index-binding-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:index-source-budget:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'replace',
            anchor: `    let chatAdditonalTokens = arg.chatAdditonalTokens ?? caculatedChatTokens
    const tokenizer = new ChatTokenizer(chatAdditonalTokens, DBState.db.aiModel.startsWith('gpt') ? 'noName' : 'name')
    let currentChat = runCurrentChatFunction(nowChatroom.chats[selectedChat])
    nowChatroom.chats[selectedChat] = currentChat
    let maxContextTokens = DBState.db.maxContext
    // Output-token reservation for the context budget. Defaults to the legacy
    // global db.maxResponse (the "[채팅 봇]" max response size), overridden below
    // when this chat is bound to a ModelPreset.
    let maxResponseTokens = DBState.db.maxResponse
    // When this chat is bound to a ModelPreset, use the preset's own input
    // budget (preset.maxContext, default 65000) instead of the global
    // db.maxContext — clamped to the model's context window when known.
    // Without this, a small global maxContext blocks large-context presets.
    {
        const mainBinding = resolveChatModelBinding(currentChat, 'model')
        if (mainBinding.kind === 'modelPreset') {
            const ctxWindow = mainBinding.preset.profileSnapshot.limits?.contextWindowTokens
            const set = mainBinding.preset.maxContext
            const budget = set && set > 0 ? set : 65000
            maxContextTokens = ctxWindow ? Math.min(budget, ctxWindow) : budget
            // Reserve output tokens from the preset's own max-output setting
            // rather than db.maxResponse — the legacy global value can be a
            // stray figure (e.g. 65535 carried over from an imported prompt
            // preset) that would eat the whole context window and make even the
            // first message fail with a false "too much token" error.
            const presetOut = resolvePresetMaxOutputTokens(mainBinding.preset)
            if (presetOut !== undefined) maxResponseTokens = presetOut
        }
    }
`,
            content: `    let chatAdditonalTokens = arg.chatAdditonalTokens ?? caculatedChatTokens
    let currentChat = runCurrentChatFunction(nowChatroom.chats[selectedChat])
    nowChatroom.chats[selectedChat] = currentChat
    let maxContextTokens = DBState.db.maxContext
    let maxResponseTokens = DBState.db.maxResponse
    const mainBinding = resolveChatModelBindingWithContext(currentChat, 'model')
    const pageFoldAssemblyState = mainBinding.kind === 'modelPreset'
        ? resolvePageFoldState({
            preset: mainBinding.preset,
            task: 'model',
            binding: mainBinding.pageFoldBinding,
            moduleBound: mainBinding.bindingSource === 'module',
        })
        : { kind: 'off' as const, reason: 'missing-config' as const }
    const pageFoldAssemblyOn = pageFoldAssemblyState.kind === 'on'
    let pageFoldSourceInputBudget: number | undefined
    let pageFoldSourceTokenizer: import('src/ts/preset/types').RegistryTokenizer | undefined

    if (mainBinding.kind === 'modelPreset') {
        const presetOut = resolvePresetMaxOutputTokens(mainBinding.preset)
        if (pageFoldAssemblyOn) {
            maxResponseTokens = resolvePageFoldOutputReserve(mainBinding.preset, presetOut, DBState.db.maxResponse)
            const sourceBudget = resolvePageFoldSourceBudget({
                preset: mainBinding.preset,
                outputReserve: maxResponseTokens,
                databaseTokenizer: DBState.db.customTokenizer,
            })
            maxContextTokens = sourceBudget.assemblyTotalBudget
            pageFoldSourceInputBudget = sourceBudget.sourceInputBudget
            pageFoldSourceTokenizer = sourceBudget.sourceTokenizer
        } else {
            const ctxWindow = mainBinding.preset.profileSnapshot.limits?.contextWindowTokens
            const set = mainBinding.preset.maxContext
            const budget = set && set > 0 ? set : 65000
            maxContextTokens = ctxWindow ? Math.min(budget, ctxWindow) : budget
            if (presetOut !== undefined) maxResponseTokens = presetOut
        }
    }
    const tokenizer = new ChatTokenizer(
        chatAdditonalTokens,
        DBState.db.aiModel.startsWith('gpt') ? 'noName' : 'name',
        pageFoldSourceTokenizer
            ? (text) => encodeWithTokenizer(text, pageFoldSourceTokenizer)
            : undefined,
    )
`,
            requires: [
                'pagefold-model-preset:index-budget-import:1.10',
                'pagefold-model-preset:index-binding-import:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:index-final-source-limit:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: '    if(inputTokens > maxContextTokens){\n',
            content: `    const finalInputLimit = pageFoldAssemblyOn
        ? (pageFoldSourceInputBudget ?? 0)
        : maxContextTokens
`,
            requires: ['pagefold-model-preset:index-source-budget:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:index-final-source-condition:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'replace',
            anchor: '    if(inputTokens > maxContextTokens){\n',
            content: '    if(inputTokens > finalInputLimit){\n',
            requires: ['pagefold-model-preset:index-final-source-limit:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:index-final-source-loop:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'replace',
            anchor: '        while(inputTokens > maxContextTokens){\n',
            content: '        while(inputTokens > finalInputLimit){\n',
            requires: ['pagefold-model-preset:index-final-source-condition:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:index-output-no-clamp:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'replace',
            anchor: '    if(inputTokens + outputTokens > maxContextTokens){\n',
            content: '    if(!pageFoldAssemblyOn && inputTokens + outputTokens > maxContextTokens){\n',
            requires: ['pagefold-model-preset:index-final-source-loop:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:preset-settings-component:1.10',
            file: 'src/lib/Setting/Pages/Model/PageFoldPresetSettings.svelte',
            type: 'owned',
            content: owned('src/lib/Setting/Pages/Model/PageFoldPresetSettings.svelte'),
            requires: ['pagefold-model-preset:index-output-no-clamp:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-overrides-component:1.10',
            file: 'src/lib/SideBars/PageFoldBindingOverrides.svelte',
            type: 'owned',
            content: owned('src/lib/SideBars/PageFoldBindingOverrides.svelte'),
            requires: ['pagefold-model-preset:preset-settings-component:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:preset-settings-import:1.10',
            file: 'src/lib/Setting/Pages/Model/ModelPresetSettings.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    import ModelPresetOptions from "./ModelPresetOptions.svelte";\n',
            content: '    import PageFoldPresetSettings from "./PageFoldPresetSettings.svelte";\n',
            requires: ['pagefold-model-preset:binding-overrides-component:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:preset-settings-ui:1.10',
            file: 'src/lib/Setting/Pages/Model/ModelPresetSettings.svelte',
            type: 'insert',
            where: 'after',
            anchor: '            {:else if submenu === 2}\n',
            managed: '                <PageFoldPresetSettings preset={editingPreset} />\n',
            markerNeedle: '<PageFoldPresetSettings',
            requires: ['pagefold-model-preset:preset-settings-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-overrides-import:1.10',
            file: 'src/lib/SideBars/ModelBind.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    import { emptyModelBinding } from "src/ts/preset/types";\n',
            content: '    import PageFoldBindingOverrides from "./PageFoldBindingOverrides.svelte";\n',
            requires: ['pagefold-model-preset:preset-settings-ui:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:binding-overrides-ui:1.10',
            file: 'src/lib/SideBars/ModelBind.svelte',
            type: 'insert',
            where: 'before',
            anchor: '    {#if presetRegime && currentChat?.modelBinding}\n',
            managed: `    {#if presetRegime && currentChat?.modelBinding}
        <PageFoldBindingOverrides binding={currentChat.modelBinding} />
    {/if}
`,
            markerNeedle: '<PageFoldBindingOverrides',
            requires: ['pagefold-model-preset:binding-overrides-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:database-role-normalizer-import:1.10',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { emptyModelBinding } from '../preset/types';\n",
            content: "import { normalizePageFoldRoleOverrides } from '../pagefold/resolve';\n",
            requires: ['pagefold-model-preset:binding-overrides-ui:1.10'],
            after: ['haejeok-chat-width-adapter:database-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:database-chat-role-normalizer:1.10',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: '    return c\n}\n\nexport interface Chat{\n',
            content: `    if (c.modelBinding) {
        const overrides = normalizePageFoldRoleOverrides(c.modelBinding.pageFold)
        if (overrides) c.modelBinding.pageFold = overrides
        else delete c.modelBinding.pageFold
    }
`,
            requires: ['pagefold-model-preset:database-role-normalizer-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lang-en:1.10',
            file: 'src/lang/en.ts',
            type: 'insert',
            where: 'after',
            anchor: '    modelPresetAbilities: "Model abilities",\n',
            content: `    pageFoldTitle: "PageFold",
    pageFoldHelp: "Send the final ModelPreset transcript as one dense PDF. Off by default; every eligible request uses PDF while enabled.",
    pageFoldMode: "System hierarchy mode",
    pageFoldModeRequired: "Choose a mode first",
    pageFoldModeMaximum: "PDF role emulation",
    pageFoldModeBalanced: "Keep native system hierarchy",
    pageFoldModeHelp: "PDF role emulation includes system rows in the PDF. Native hierarchy keeps system messages in Gemini's system instruction.",
    pageFoldQualified: "Qualified for this exact route",
    pageFoldBlocked: "Blocked: {reason}",
    pageFoldQualifiedRoute: "Vertex global · {model} · fixed low media resolution · up to {pages} PDF pages · oracle v8",
    pageFoldNoResolutionPicker: "Resolution and page ceiling are qualification metadata, not editable settings.",
    pageFoldConflictWarning: "Images, tool use, and PocketRisu explicit Gemini caching are blocked while PageFold is on.",
    pageFoldFidelityTitle: "Evidence and fidelity",
    pageFoldFidelityExact: "Canonical JSONL → PDF.js extraction is byte-exact.",
    pageFoldFidelitySemantic: "Vertex-low semantic recall, order, boundaries, and both hierarchy modes passed v8.",
    pageFoldFidelityDeferred: "Verbatim typography and narrative quality remain separate gates.",
    pageFoldRoleOverrides: "PageFold role overrides",
    pageFoldRoleOverridesHelp: "Each logical task can inherit the selected preset, force PageFold on, or force it off.",
    pageFoldInherit: "Inherit",
    pageFoldOn: "On",
    pageFoldOff: "Off",
    pageFoldBadgeOn: "PF ON",
    pageFoldBadgeOff: "PF OFF",
    pageFoldBadgeBlocked: "PF BLOCKED",
`,
            requires: ['pagefold-model-preset:database-chat-role-normalizer:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:lang-ko:1.10',
            file: 'src/lang/ko.ts',
            type: 'insert',
            where: 'after',
            anchor: '  modelPresetAbilities: "모델 능력",\n',
            content: `  pageFoldTitle: "PageFold",
  pageFoldHelp: "최종 ModelPreset 대화를 고밀도 PDF 하나로 전송해요. 기본은 꺼짐이며, 켜진 동안 모든 eligible 요청이 PDF를 사용해요.",
  pageFoldMode: "시스템 계층 모드",
  pageFoldModeRequired: "먼저 모드를 선택하세요",
  pageFoldModeMaximum: "PDF 역할 에뮬레이션",
  pageFoldModeBalanced: "네이티브 시스템 계층 유지",
  pageFoldModeHelp: "PDF 역할 에뮬레이션은 system 행도 PDF에 넣고, 네이티브 계층 유지는 system 메시지를 Gemini system instruction에 남겨요.",
  pageFoldQualified: "이 exact route는 qualification을 통과했어요",
  pageFoldBlocked: "차단됨: {reason}",
  pageFoldQualifiedRoute: "Vertex global · {model} · 고정 low media resolution · PDF 최대 {pages}페이지 · oracle v8",
  pageFoldNoResolutionPicker: "해상도와 페이지 상한은 qualification metadata이며 편집 설정이 아니에요.",
  pageFoldConflictWarning: "PageFold가 켜진 동안 이미지, 도구 사용, PocketRisu 명시적 Gemini 캐시는 차단돼요.",
  pageFoldFidelityTitle: "증거와 fidelity",
  pageFoldFidelityExact: "Canonical JSONL → PDF.js 추출은 byte-exact예요.",
  pageFoldFidelitySemantic: "Vertex-low 의미 recall·순서·페이지 경계·두 계층 모드는 v8을 통과했어요.",
  pageFoldFidelityDeferred: "Verbatim typography와 narrative quality는 별도 gate예요.",
  pageFoldRoleOverrides: "PageFold 역할별 override",
  pageFoldRoleOverridesHelp: "각 논리 작업은 선택 preset을 상속하거나 PageFold를 강제로 켜고 끌 수 있어요.",
  pageFoldInherit: "상속",
  pageFoldOn: "켜기",
  pageFoldOff: "끄기",
  pageFoldBadgeOn: "PF 켜짐",
  pageFoldBadgeOff: "PF 꺼짐",
  pageFoldBadgeBlocked: "PF 차단됨",
`,
            requires: ['pagefold-model-preset:lang-en:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:persistence-tests:1.10',
            file: 'src/ts/pagefold/persistence.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/persistence.test.ts'),
            requires: ['pagefold-model-preset:lang-ko:1.10'],
            targetVersions: pocketRisu1100,
        },
    ],
}
