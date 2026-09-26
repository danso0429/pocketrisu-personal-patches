import { describe, expect, test } from 'vitest'
import { cssToggleDefinitions } from './cssToggleDefinitions'
import { cssEditorText, storedCssFromEditor } from './cssEditorText'

const prefix = 'html[data-pocketrisu-css~="chat-align-center"]'
const project = (css: string, shipped = true) => cssEditorText({ id: 'chat.alignment', css, shipped })

describe('CSS editor internal-selector projection', () => {
    test('all shipped editors omit owned selectors and unchanged saves retain exact bytes', () => {
        for (const definition of cssToggleDefinitions) {
            const view = cssEditorText({ ...definition, shipped: true })
            expect(view.text).not.toContain('data-pocketrisu-css')
            expect(storedCssFromEditor(view, view.text)).toBe(definition.css)
        }
    })
    test('declaration edits retain existing selectors, specificity, and nested media', () => {
        const css = `@media (min-width: 1px) {\n${prefix} .chat:is(.a, .b),\n${prefix} .other { color: red; }\n}`
        const view = project(css)
        expect(view.text).not.toContain(prefix)
        const saved = storedCssFromEditor(view, view.text.replace('red', 'blue'))
        expect(saved).toContain(`${prefix} .chat:is(.a, .b)`)
        expect(saved).toContain(`${prefix} .other`)
        expect(saved).toContain('color: blue')
        expect(project(saved).text).not.toContain(prefix)
    })
    test('new and changed selectors are ordinary CSS without invented IDs or wrappers', () => {
        const view = project(`${prefix} .old { color: red; }`)
        const edited = view.text.replace('.old', 'html') + '\nbody { background: black; }'
        expect(storedCssFromEditor(view, edited)).toBe(edited)
    })
    test('custom CSS, including authored html selectors, stays byte-identical', () => {
        const css = `${prefix} .x { color: red; }\nhtml { --color: red; }`
        const view = project(css, false)
        expect(view.text).toBe(css)
        expect(storedCssFromEditor(view, css.replace('red', 'blue'))).toBe(css.replace('red', 'blue'))
    })
    test('new nested rules and animation selectors do not acquire an unrelated top-level prefix', () => {
        const view = project(`${prefix} from { color: red; }\n${prefix} .x { color: red; }`)
        const edited = '.outer { .x { color: blue; } }\n@keyframes sample { from { opacity: 0; } }'
        expect(storedCssFromEditor(view, edited)).toBe(edited)
    })
    test('comments, strings, at-rules, other tokens, and real html selectors are not hidden', () => {
        const css = `/* ${prefix} */\n${prefix} .x { content: '${prefix}'; }\nhtml { color: red; }\nhtml[data-pocketrisu-css~="other"] .x { color: blue; }\n@font-face { font-family: sample; src: url("font.woff2"); }\n@keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n/*# sourceMappingURL=missing.map */`
        const view = project(css)
        expect(view.text).toContain(`/* ${prefix} */`)
        expect(view.text).toContain(`content: '${prefix}'`)
        expect(view.text).toContain('html { color: red; }')
        expect(view.text).toContain('html[data-pocketrisu-css~="other"]')
        expect(view.text).toContain('@font-face')
        expect(view.text).toContain('@keyframes')
        expect(storedCssFromEditor(view, view.text)).toBe(css)
    })
    test('duplicate visible selectors preserve their original ordered scoped and unscoped forms', () => {
        const view = project(`${prefix} .x { color: red; }\n.x { color: green; }`)
        const saved = storedCssFromEditor(view, view.text.replace('green', 'blue'))
        expect(saved).toBe(`${prefix} .x { color: red; }\n.x { color: blue; }`)
    })
    test('a malformed draft is preserved instead of being truncated or made executable by parsing', () => {
        const malformed = `${prefix} .x { content: "unfinished`
        expect(project(malformed).text).toBe(malformed)
        const view = project(`${prefix} .x { color: red; }`)
        const edited = '.x { color: blue; /* unfinished'
        expect(storedCssFromEditor(view, edited)).toBe(edited)
    })
})
