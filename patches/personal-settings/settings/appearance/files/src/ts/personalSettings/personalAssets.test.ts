import { expect, test } from 'vitest'
import fs from 'node:fs'
import ts from 'typescript'

function extract(file: string, name: string, context: Record<string, unknown>) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const declaration = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
    if (!declaration) throw new Error(`Missing composed ${name}`)
    const js = ts.transpileModule(declaration.getText(source).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    return new Function(...Object.keys(context), `${js};return ${name}`)(...Object.values(context))
}
const basename = (v: unknown) => typeof v === 'string' ? v.replaceAll('\\', '/').split('/').pop() : undefined
const client = extract('src/ts/globalApi.svelte.ts', 'getUncleanables', { getBasename: basename })
const server = extract('server/node/server.cjs', 'buildUncleanableSet', { statsBasename: basename })
const remap = extract('src/ts/globalApi.svelte.ts', 'replaceDbResources', {})
test.each([
    [{ appearance: { version: 1, fonts: { version: 1, custom: [{ assetPath: 'assets/one.woff2' }, { assetPath: 'assets/one.woff2' }] } } }, ['one.woff2']],
    [{ appearance: { version: 100, fonts: { version: 7, badShape: ['assets/two.otf', { future: 'assets/three.ttf' }] } } }, ['two.otf', 'three.ttf']],
    [{ malformed: 'url(assets/four.woff)', nested: [null, 7, false] }, ['four.woff']],
    [{ future: { path: 'assets/한글 폰트.otf', css: 'url(assets/다른폰트.woff2)' } }, ['한글 폰트.otf', '다른폰트.woff2']],
] as const)('client cleanup and server backup/report/purge preserve the same supported or future corpus %j', (personal, expected) => {
    const db = { characters: [], pocketRisuPersonalSettings: personal }
    const before = JSON.stringify(db)
    expect([...server(db)].sort()).toEqual(client(db).sort())
    for (const reference of expected) expect(client(db)).toContain(reference)
    expect(JSON.stringify(db)).toBe(before)
    expect([...server(db, { includeModuleAssets: false })].sort()).toEqual(client(db).sort())
})
test('restore remaps exact asset strings without changing CSS, names, or adjacent fields', () => {
    const db = { characters: [], pocketRisuPersonalSettings: { appearance: { fonts: { version: 99, nested: [{ path: 'assets/old.woff2', css: 'url(assets/old.woff2)', name: 'prefix assets/old.woff2' }] }, adjacent: true } } }
    remap(db, { 'assets/old.woff2': 'assets/new.woff2' })
    expect(db.pocketRisuPersonalSettings.appearance).toEqual({ fonts: { version: 99, nested: [{ path: 'assets/new.woff2', css: 'url(assets/old.woff2)', name: 'prefix assets/old.woff2' }] }, adjacent: true })
})
test('reference traversal handles large malformed future arrays without argument-stack overflow', () => {
    const db = { characters: [], pocketRisuPersonalSettings: { future: Array.from({ length: 150_000 }, () => 'assets/shared.woff2') } }
    expect(client(db)).toEqual(['shared.woff2'])
    expect([...server(db)]).toEqual(['shared.woff2'])
})
