'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadCatalog } = require('../src/catalog.cjs')
const { resolveSelection } = require('../src/resolver.cjs')
const root = require('../patches/pagefold-model-preset/manifest.cjs')
const adapter = require('../patches/pagefold-bg-adapter/manifest.cjs')

test('PageFold BG adapter is hidden and enters only the exact dual-owner graph', () => {
  assert.equal(adapter.userSelectable, false)
  assert.deepEqual(adapter.targets.pocketrisu, { verified: ['1.10.0'], reviewing: [] })
  assert.deepEqual(adapter.requires, ['pagefold-model-preset', 'bg-preserve'])
  assert.deepEqual(adapter.autoWhen, { all: ['pagefold-model-preset', 'bg-preserve'] })
  const catalog = loadCatalog()
  assert.equal(resolveSelection(catalog, [root.id]).resolvedIds.includes(adapter.id), false)
  assert.equal(resolveSelection(catalog, ['bg-preserve']).resolvedIds.includes(adapter.id), false)
  assert.equal(resolveSelection(catalog, [root.id, 'bg-preserve']).resolvedIds.includes(adapter.id), true)
})

test('PageFold BG adapter installs one in-process port without a second lifecycle', () => {
  const byId = new Map(adapter.units.map((unit) => [unit.id, unit]))
  assert.match(byId.get('pagefold-bg-adapter:orchestrator-install-port:1.10').content, /__pageFoldRenderPort/)
  assert.match(byId.get('pagefold-bg-adapter:orchestrator-install-port:1.10').content, /createPageFoldBgRenderPort/)
  const source = adapter.units.map((unit) => unit.content ?? unit.managed ?? '').join('\n')
  assert.doesNotMatch(source, /operationResultKey|writeOperationState|deliveryClaim|acknowledgeResult/)
  assert.doesNotMatch(source, /setDatabase(?:Lite)?\s*\(|plugins\s*:/)
})
