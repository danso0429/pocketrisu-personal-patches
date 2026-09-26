import { parse, type AnyNode, type Rule } from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { cssToggleDefinitions } from './cssToggleDefinitions'

export interface CssEditorText {
    text: string
    original: string
    selectors: Map<string, string[]>
}

function topLevelSelector(rule: Rule): boolean {
    for (let parent: AnyNode | undefined = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'rule' || (parent.type === 'atrule' && /keyframes$/i.test(parent.name))) return false
    }
    return true
}

// This projection belongs to the editor only. Runtime and stored CSS remain
// untouched until the user explicitly saves an edited draft.
export function cssEditorText(item: { id: string; css: string; shipped: boolean }): CssEditorText {
    const original = item.css
    const plain = { text: original, original, selectors: new Map<string, string[]>() }
    const token = item.shipped && cssToggleDefinitions.find(d => d.id === item.id)?.token
    if (!token) return plain
    try {
        const root = parse(original, { from: undefined, map: false })
        const selectors = new Map<string, string[]>()
        let changed = false
        root.walkRules(rule => {
            if (!topLevelSelector(rule)) return
            const ast = selectorParser().astSync(rule.selector)
            for (const selector of ast.nodes) {
                const stored = selector.toString().trim()
                const [tag, attribute, space] = selector.nodes
                if (tag?.type === 'tag' && tag.value === 'html' && !tag.namespace
                    && attribute?.type === 'attribute' && attribute.attribute === 'data-pocketrisu-css'
                    && !attribute.namespace && attribute.operator === '~=' && attribute.value === token
                    && space?.type === 'combinator' && space.value === ' ' && selector.nodes.length > 3) {
                    tag.remove(); attribute.remove(); space.remove()
                    changed = true
                }
                const visible = selector.toString().trim()
                selectors.set(visible, [...(selectors.get(visible) ?? []), stored])
            }
            rule.selector = ast.toString()
        })
        return changed ? { text: root.toString(), original, selectors } : plain
    } catch {
        // Preserve unsupported/malformed authored CSS instead of guessing at
        // comments, strings, declarations, or unknown selector syntax.
        return plain
    }
}

export function storedCssFromEditor(projection: CssEditorText, text: string): string {
    if (text === projection.text) return projection.original
    if (!projection.selectors.size) return text
    try {
        const root = parse(text, { from: undefined, map: false })
        const used = new Map<string, number>()
        root.walkRules(rule => {
            if (!topLevelSelector(rule)) return
            rule.selectors = rule.selectors.map(selector => {
                const key = selector.trim(), index = used.get(key) ?? 0
                used.set(key, index + 1)
                // Keep original selector specificity for declaration edits.
                // New/changed selectors are ordinary CSS; style-node ownership
                // already enforces this item's activation and recovery gates.
                return projection.selectors.get(key)?.[index] ?? selector
            })
        })
        return root.toString()
    } catch {
        return text
    }
}
