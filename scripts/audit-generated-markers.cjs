#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

// A bounded diagnostic of generated return semantics, not a proof of all ASI
// hazards. Parse Svelte script regions only; template/style coverage is reported.
function audit(root) {
    const ts = createRequire(path.join(root, 'package.json'))('typescript')
    const result = { compiler: ts.version, files: 0, scriptRegions: 0,
        nonScriptMarkers: 0, bareReturnMarkers: [], otherRestrictedMarkers: [] }
    function region(text, file, offset) {
        result.scriptRegions++
        const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
        function visit(node) {
            if (ts.isReturnStatement(node) && !node.expression) {
                const tail = text.slice(node.getStart(ast), node.end + 300)
                const marker = /^return[ \t]*\/\* (POCKETRISU-PATCH:[^*]+:START) \*\/[ \t]*[\r\n]/.exec(tail)
                if (marker) result.bareReturnMarkers.push({ file,
                    line: offset + ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
                    marker: marker[1] })
            }
            ts.forEachChild(node, visit)
        }
        visit(ast)
        // These are review candidates, not automatic findings. The scanner keeps
        // strings/template contents from being mistaken for generated boundaries.
        const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text)
        let previous = ''
        while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
            const kind = scanner.getToken()
            if (kind === ts.SyntaxKind.MultiLineCommentTrivia) {
                const token = scanner.getTokenText()
                if (token.includes('POCKETRISU-PATCH:') && token.includes(':START')
                    && ['throw', 'yield', 'break', 'continue', 'async'].includes(previous)) {
                    result.otherRestrictedMarkers.push({ file, previous,
                        line: offset + ast.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1 })
                }
            } else if (![ts.SyntaxKind.WhitespaceTrivia, ts.SyntaxKind.NewLineTrivia,
                ts.SyntaxKind.SingleLineCommentTrivia].includes(kind)) previous = scanner.getTokenText()
        }
    }
    function walk(dir) {
        if (!fs.existsSync(dir)) return
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue
            const absolute = path.join(dir, entry.name)
            if (entry.isDirectory()) { walk(absolute); continue }
            if (!/\.(?:[cm]?js|ts|svelte)$/.test(entry.name)) continue
            const text = fs.readFileSync(absolute, 'utf8')
            if (!text.includes('POCKETRISU-PATCH:')) continue
            result.files++
            const file = path.relative(root, absolute)
            if (!entry.name.endsWith('.svelte')) { region(text, file, 0); continue }
            let scriptMarkers = 0
            for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
                const start = match.index + match[0].indexOf('>') + 1
                scriptMarkers += (match[1].match(/POCKETRISU-PATCH:/g) || []).length
                region(match[1], file, text.slice(0, start).split('\n').length - 1)
            }
            result.nonScriptMarkers += (text.match(/POCKETRISU-PATCH:/g) || []).length - scriptMarkers
        }
    }
    walk(path.join(root, 'src'))
    walk(path.join(root, 'server/node'))
    return result
}

if (require.main === module) {
    if (!process.argv[2]) throw Error('Usage: node scripts/audit-generated-markers.cjs <generated-target>')
    const result = audit(path.resolve(process.argv[2]))
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.bareReturnMarkers.length ? 1 : 0
}
module.exports = { audit }
