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
    ],
}
