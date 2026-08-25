'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files-1.10')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const target = { pocketrisu: ['1.10.0'] }

module.exports = {
  id: 'pagefold-bg-adapter',
  title: 'PageFold bg-preserve adapter',
  version: '0.1.0',
  source: 'Independent PageFold render-port composition',
  targets: { pocketrisu: { verified: [], reviewing: ['1.10.0'] } },
  userSelectable: false,
  requires: ['pagefold-model-preset', 'bg-preserve'],
  autoWhen: { all: ['pagefold-model-preset', 'bg-preserve'] },
  units: [
    {
      id: 'pagefold-bg-adapter:render-port:1.10',
      file: 'server/node/pageFoldBgRenderPort.cjs',
      type: 'owned',
      content: owned('server/node/pageFoldBgRenderPort.cjs'),
      targetVersions: target,
    },
    {
      id: 'pagefold-bg-adapter:render-port-tests:1.10',
      file: 'server/node/pageFoldBgRenderPort.test.ts',
      type: 'owned',
      content: owned('server/node/pageFoldBgRenderPort.test.ts'),
      requires: ['pagefold-bg-adapter:render-port:1.10'],
      targetVersions: target,
    },
    {
      id: 'pagefold-bg-adapter:orchestrator-import:1.10',
      file: 'server/node/bgOrchestrator.cjs',
      type: 'insert',
      where: 'after',
      anchor: "const BUNDLE = path.join(__dirname, 'bgOrchBundle.mjs')\n",
      content: "const { createPageFoldBgRenderPort } = require('./pageFoldBgRenderPort.cjs')\n",
      requires: ['pagefold-bg-adapter:render-port-tests:1.10'],
      after: ['bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9'],
      targetVersions: target,
    },
    {
      id: 'pagefold-bg-adapter:orchestrator-install-port:1.10',
      file: 'server/node/bgOrchestrator.cjs',
      type: 'insert',
      where: 'before',
      anchor: '    await import(pathToFileURL(BUNDLE).href) // sets globalThis.__bgOrch + window/document stubs\n',
      content: `    // Runtime-only binary port. The bundle sees the same global object; no
    // canonical/PDF bytes enter operation/result/claim persistence.
    globalThis.__pageFoldRenderPort ??= createPageFoldBgRenderPort()
`,
      requires: ['pagefold-bg-adapter:orchestrator-import:1.10'],
      after: ['bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9'],
      targetVersions: target,
    },
    {
      id: 'pagefold-bg-adapter:bundle-stale-sources:1.10',
      file: 'server/node/bgOrchestrator.cjs',
      type: 'insert',
      where: 'after',
      anchor: "      'src/ts/process/request/request.ts',\n",
      content: `      'src/ts/pagefold/qualifiedRoute.ts', 'src/ts/pagefold/resolve.ts',
      'src/ts/pagefold/prepare.ts', 'src/ts/pagefold/budget.ts',
      'src/ts/pagefold/failurePolicy.ts', 'src/ts/pagefold/metrics.ts',
`,
      requires: ['pagefold-bg-adapter:orchestrator-install-port:1.10'],
      after: ['bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9'],
      targetVersions: target,
    },
  ],
}
