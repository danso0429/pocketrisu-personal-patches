'use strict'
// Decision evidence for theme-independent Personal CSS and the body-only chat
// font. Re-run it after an upstream rebase or when a theme reports a font or
// alignment regression, then compare with results.json.
//
//   NODE_PATH=<dir containing playwright-core@1.55.0> node measure-cascade.cjs \
//     --css <built dist/assets/index-*.css> \
//     --definitions <src/ts/personalSettings/cssToggleDefinitions.ts> \
//     --chromium <chromium executable> [--source <pristine PocketRisu root>] [--out <file>]
//
// --source verifies the upstream anchors the design depends on, verbatim.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { chromium } = require('playwright-core')

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (index % 2 ? pairs : [...pairs, [value.replace(/^--/, ''), all[index + 1]]]), []))
for (const key of ['css', 'definitions', 'chromium']) if (!args[key]) throw new Error(`--${key} is required`)

// Upstream PocketRisu v1.10.0 (98e9683) lines the design relies on.
const anchors = [
    { file: 'src/styles.css', line: 397, text: '* {', claim: 'Every element takes its font from the variable, so descendants do not inherit a parent font-family.' },
    { file: 'src/styles.css', line: 398, text: '  font-family: var(--risu-font-family);' },
    { file: 'src/ts/gui/colorscheme.ts', line: 445, text: "            root.style.setProperty('--risu-font-family', db.customFont);", claim: 'The app font setting is delivered through the same variable.' },
    { file: 'src/ts/gui/colorscheme.ts', line: 451, text: "        CustomCSSStore.set(db.customCSS ?? '')", claim: 'Global custom CSS is the theme CSS channel; Safe Mode clears it.' },
    { file: 'src/ts/stores.svelte.ts', line: 128, text: "        s.id = 'customcss'" },
    { file: 'src/ts/stores.svelte.ts', line: 130, text: '        document.body.appendChild(s)', claim: '#customcss is appended to body after the static #app root.' },
    { file: 'index.html', line: 20, text: '    <div id="app">' },
    { file: 'src/lib/ChatScreens/Chat.svelte', line: 1126, text: '<div class="flex max-w-full justify-center risu-chat"', claim: 'Every theme shares the .risu-chat[data-chat-index] message root.' },
    { file: 'src/lib/ChatScreens/Chat.svelte', line: 1127, text: '     data-chat-index={idx}' },
    { file: 'src/lib/ChatScreens/Chat.svelte', line: 435, text: '        <span class="text chat-width chattext prose minw-0"', claim: 'Message text renders in one .chattext root.' },
    { file: 'src/lib/ChatScreens/Chat.svelte', line: 1089, text: "    {:else if dom.tagName === 'RISUTEXTBOX'}", claim: 'Custom HTML <risutextbox> renders the same text box.' },
    { file: 'src/lib/ChatScreens/Chat.svelte', line: 1097, text: "    {:else if dom.tagName === 'STYLE'}", claim: 'Custom HTML can also render <style> inside the message, within #app.' },
    { file: 'src/lib/ChatScreens/DefaultChatScreen.svelte', line: 1268, text: "            class:nodeonly-standard={DBState.db.theme === ''}", claim: 'Only PocketRisu Standard adds .nodeonly-standard.' },
    { file: 'src/ts/setting/displaySettingsData.svelte.ts', line: 27, text: "                { value: 'customHTML', label: 'Custom HTML' },", claim: "Custom HTML is db.theme 'customHTML'; Standard is ''." },
    { file: 'src/ts/hotkey.ts', line: 95, text: '                    SafeModeStore.set(!get(SafeModeStore))', claim: 'Safe Mode is the toggleCSS emergency hotkey.' },
]
function checkAnchors(root) {
    return anchors.map(anchor => {
        const lines = fs.readFileSync(path.join(root, anchor.file), 'utf8').split('\n')
        return { ...anchor, matches: lines[anchor.line - 1] === anchor.text }
    })
}

const built = fs.readFileSync(args.css, 'utf8')
const P = 'html[data-pocketrisu-css*=chat-font-]'
const root = `${P} .default-chat-screen .risu-chat[data-chat-index] .chattext`
const chosenFont = `${root}{--risu-font-family:var(--personal-chat-font-family)!important;font-family:var(--personal-chat-font-family)!important}`
const chosenCode = `:where(${root}) :is(pre,code,kbd,samp){font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,monospace}`
for (const rule of [chosenFont, chosenCode]) if (!built.includes(rule)) throw new Error(`chosen rule not found verbatim: ${rule.slice(0, 80)}`)
const variants = {
    // Adopted: the variable and font on the text root only.
    chosen: built,
    // Rejected: the former descendant-wide rule overrides every theme font.
    descendantWide: built.replace(chosenFont, `${root},${root} :where(*){font-family:var(--personal-chat-font-family)!important}`)
        .replace(chosenCode, chosenCode.replace('monospace}', 'monospace!important}')),
    // Rejected: font-family without the variable does not reach descendants.
    containerFontOnly: built.replace(chosenFont, `${root}{font-family:var(--personal-chat-font-family)!important}`),
}

const text = fs.readFileSync(args.definitions, 'utf8')
const definitions = JSON.parse(text.slice(text.indexOf('= [') + 2))
const alignment = definitions.find(d => d.id === 'chat.alignment').css
// A neutral theme fixture with the patterns seen in real Custom HTML themes.
const fixture = `
.fx-root { --fx-sans: "Fixture Sans"; --fx-serif: "Fixture Serif"; --risu-font-family: var(--fx-sans); font-family: var(--fx-sans); text-align: left; }
.fx-body .chattext { font-family: var(--fx-sans); }
.fx-body .chattext :where(h1, h2, h3) { font-family: var(--fx-serif); --risu-font-family: var(--fx-serif); }
.fx-root .fx-body .chattext mark[risu-mark="quote1"], .fx-root .fx-body .chattext mark[risu-mark="quote2"] { font-family: var(--fx-serif); --risu-font-family: var(--fx-serif); }
.fx-body .chattext code { font-family: "Fixture Mono"; }
.fx-body .chattext td { text-align: left; }
.fx-body .chattext p.tie { color: rgb(128, 0, 0); }`
const adversarial = `.risu-chat .chattext { --risu-font-family: "Fixture Root"; font-family: "Fixture Root"; text-align: justify; }
.risu-chat .chattext p.lead { font-family: "Fixture Para"; }`
const tie = '.fx-body .chattext p.tie { color: rgb(0, 128, 0); }'
const content = `root text<p id="p">body</p><p class="lead" id="lead">lead</p><p class="tie" id="tie">tie</p><p><mark risu-mark="quote2" id="q2">"q2"</mark> <mark risu-mark="quote1" id="q1">'q1'</mark> <em id="em">em</em></p><h2 id="h2">h2</h2><blockquote><p id="bqp">quote</p></blockquote><ul><li id="li">li</li></ul><pre><code id="code">code</code></pre><table><tr><td id="td">td</td></tr></table>`
const message = (inner, standard = false) => `<div id="app"><div class="default-chat-screen${standard ? ' nodeonly-standard' : ''}"><div class="flex max-w-full justify-center risu-chat" data-chat-index="0">${inner}</div></div></div>`
const themed = style => message(`<div class="fx-root">${style}<div class="fx-body"><span id="ct" class="text chat-width chattext prose minw-0">${content}</span></div></div>`)
const plain = standard => message(`<span id="ct" class="text chat-width chattext prose minw-0">${content}</span>`, standard)
const cases = {
    customcssTheme: { dom: themed(''), customcss: fixture },
    inMessageStyleTheme: { dom: themed(`<style>${fixture}</style>`), customcss: '' },
    standard: { dom: plain(true), customcss: '' },
    adversarialTheme: { dom: plain(false), customcss: adversarial },
}
const ids = ['ct', 'p', 'lead', 'tie', 'q2', 'q1', 'em', 'h2', 'bqp', 'li', 'code', 'td']
const label = family => /Paperlogy/.test(family) ? 'personal' : /ui-monospace/.test(family) ? 'monospace' : /Fixture/.test(family) ? family.replace(/"/g, '') : family

;(async () => {
    const browser = await chromium.launch({ executablePath: args.chromium })
    const page = await browser.newPage()
    const measurements = {}
    for (const [variant, css] of Object.entries(variants)) for (const [name, item] of Object.entries(cases)) for (const order of ['personalAfterTheme', 'personalBeforeTheme']) {
        if (order === 'personalBeforeTheme' && (variant !== 'chosen' || name !== 'customcssTheme')) continue
        const personal = `<style data-pocketrisu-personal-css="shipped:chat.alignment">${alignment}</style><style data-pocketrisu-personal-css="custom:tie">${tie}</style>`
        const theme = `<style id="customcss">${item.customcss}</style>`
        await page.setContent(`<!doctype html><html data-pocketrisu-css="chat-font-paperlogy chat-align-center"><head><style>${css}</style></head><body>${item.dom}${order === 'personalAfterTheme' ? theme + personal : personal + theme}</body></html>`)
        const raw = await page.evaluate(list => Object.fromEntries(list.map(id => { const style = getComputedStyle(document.getElementById(id)); return [id, [style.fontFamily, style.textAlign, style.color]] })), ids)
        measurements[`${variant}/${name}/${order}`] = Object.fromEntries(ids.map(id => [id, { font: label(raw[id][0]), textAlign: raw[id][1], ...(id === 'tie' ? { color: raw[id][2] } : {}) }]))
    }
    const result = {
        generatedBy: 'measure-cascade.cjs',
        chromium: browser.version(),
        css: { file: path.basename(args.css), sha256: crypto.createHash('sha256').update(built).digest('hex') },
        anchors: args.source ? checkAnchors(args.source) : 'not checked',
        measurements,
    }
    await browser.close()
    const output = JSON.stringify(result, null, 2) + '\n'
    if (args.out) fs.writeFileSync(args.out, output)
    else process.stdout.write(output)
    if (Array.isArray(result.anchors) && result.anchors.some(anchor => !anchor.matches)) process.exitCode = 1
})()
