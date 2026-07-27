'use strict'

const fs = require('node:fs')
const path = require('node:path')

const anchorsRoot = path.join(__dirname, 'anchors')
const filesRoot = path.join(__dirname, 'files')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')

module.exports = {
    id: 'toolchain-hardening',
    version: '0.1.0',
    units: [
        {
            id: 'toolchain-hardening:vitest-storage',
            file: 'vitest.setup.ts',
            type: 'replace',
            anchor: read(anchorsRoot, 'vitest.setup.ts'),
            managed: read(filesRoot, 'vitest.setup.ts'),
            markerNeedle: "new Storage()",
        },
        {
            id: 'toolchain-hardening:package-lightningcss-override',
            file: 'package.json',
            type: 'insert',
            where: 'after',
            anchor: '  "pnpm": {\n',
            managed: `    "overrides": {
      "lightningcss": "1.33.0"
    },
`,
            markerNeedle: '"lightningcss": "1.33.0"',
        },
        {
            id: 'toolchain-hardening:lock-lightningcss-override',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'after',
            anchor: '  excludeLinksFromLockfile: false\n',
            managed: `
overrides:
  lightningcss: 1.33.0
`,
            markerNeedle: 'overrides:\n  lightningcss: 1.33.0',
        },
        {
            id: 'toolchain-hardening:lock-lightningcss-packages',
            file: 'pnpm-lock.yaml',
            type: 'replace',
            anchor: read(anchorsRoot, 'pnpm-lock-packages.yaml'),
            managed: read(filesRoot, 'pnpm-lock-packages.yaml'),
            markerNeedle: 'lightningcss@1.33.0:',
            requires: ['toolchain-hardening:lock-lightningcss-override'],
        },
        {
            id: 'toolchain-hardening:lock-tailwind-lightningcss',
            file: 'pnpm-lock.yaml',
            type: 'replace',
            anchor: `  '@tailwindcss/node@4.2.2':
    dependencies:
      '@jridgewell/remapping': 2.3.5
      enhanced-resolve: 5.20.1
      jiti: 2.6.1
      lightningcss: 1.32.0
      magic-string: 0.30.21
`,
            managed: `  '@tailwindcss/node@4.2.2':
    dependencies:
      '@jridgewell/remapping': 2.3.5
      enhanced-resolve: 5.20.1
      jiti: 2.6.1
      lightningcss: 1.33.0
      magic-string: 0.30.21
`,
            markerNeedle: `  '@tailwindcss/node@4.2.2':
    dependencies:
      '@jridgewell/remapping': 2.3.5
      enhanced-resolve: 5.20.1
      jiti: 2.6.1
      lightningcss: 1.33.0`,
            requires: ['toolchain-hardening:lock-lightningcss-packages'],
        },
        {
            id: 'toolchain-hardening:lock-lightningcss-snapshots',
            file: 'pnpm-lock.yaml',
            type: 'replace',
            anchor: read(anchorsRoot, 'pnpm-lock-snapshots.yaml'),
            managed: read(filesRoot, 'pnpm-lock-snapshots.yaml'),
            markerNeedle: `lightningcss-android-arm64@1.33.0:
    optional: true`,
            requires: ['toolchain-hardening:lock-tailwind-lightningcss'],
        },
        {
            id: 'toolchain-hardening:lock-vite-lightningcss',
            file: 'pnpm-lock.yaml',
            type: 'replace',
            anchor: `  vite@8.0.8(@types/node@22.19.3)(esbuild@0.27.2)(jiti@2.6.1)(yaml@2.8.2):
    dependencies:
      lightningcss: 1.32.0
      picomatch: 4.0.4
`,
            managed: `  vite@8.0.8(@types/node@22.19.3)(esbuild@0.27.2)(jiti@2.6.1)(yaml@2.8.2):
    dependencies:
      lightningcss: 1.33.0
      picomatch: 4.0.4
`,
            markerNeedle: `  vite@8.0.8(@types/node@22.19.3)(esbuild@0.27.2)(jiti@2.6.1)(yaml@2.8.2):
    dependencies:
      lightningcss: 1.33.0`,
            requires: ['toolchain-hardening:lock-lightningcss-snapshots'],
        },
    ],
}
