'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')

module.exports = {
    id: 'parser-hardening',
    title: 'Parser hardening',
    version: '0.1.0',
    userSelectable: true,
    presetDefaults: ['hardening'],
    units: [
        {
            id: 'parser-hardening:thought-extractor',
            file: 'src/ts/parser/thoughts.ts',
            type: 'owned',
            content: owned('src/ts/parser/thoughts.ts'),
        },
        {
            id: 'parser-hardening:thought-extractor-tests',
            file: 'src/ts/parser/tests/thoughts.test.ts',
            type: 'owned',
            content: owned('src/ts/parser/tests/thoughts.test.ts'),
        },
        {
            id: 'parser-hardening:chatml-thought-import',
            file: 'src/ts/parser/chatML.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { risuChatParser } from './parser.svelte'\n",
            content: "import { extractThoughts } from './thoughts'\n",
            requires: ['parser-hardening:thought-extractor'],
        },
        {
            id: 'parser-hardening:chatml-parser',
            file: 'src/ts/parser/chatML.ts',
            type: 'replace',
            anchor: `  return trimedData
    .split(starter)
    .filter((f) => f !== '')
    .map((v) => {
      let role: 'system' | 'user' | 'assistant' = 'user'
      //default separators
      if (v.startsWith('user' + seperator)) {
        role = 'user'
        v = v.substring(4 + seperator.length)
      } else if (v.startsWith('system' + seperator)) {
        role = 'system'
        v = v.substring(6 + seperator.length)
      } else if (v.startsWith('assistant' + seperator)) {
        role = 'assistant'
        v = v.substring(9 + seperator.length)
      }
      //space/newline separators
      else if (v.startsWith('user ') || v.startsWith('user\\n')) {
        role = 'user'
        v = v.substring(5)
      } else if (v.startsWith('system ') || v.startsWith('system\\n')) {
        role = 'system'
        v = v.substring(7)
      } else if (v.startsWith('assistant ') || v.startsWith('assistant\\n')) {
        role = 'assistant'
        v = v.substring(10)
      }

      v = v.trim()

      if (v.endsWith(ender)) {
        v = v.substring(0, v.length - ender.length)
      }

      let thoughts: string[] = []
      v = v.replace(/<Thoughts>(.+)<\\/Thoughts>/gms, (_, p1) => {
        thoughts.push(p1)
        return ''
      })

      return {
        role: role,
        content: risuChatParser(v),
        thoughts: thoughts,
      }
    })`,
            content: `  const segments = trimedData
    .split(starter)
    .filter((f) => f !== '')

  return segments.flatMap((segment, index) => {
    let v = segment
    let role: 'system' | 'user' | 'assistant' = 'user'
    let recognizedRole = false
    //default separators
    if (v.startsWith('user' + seperator)) {
      role = 'user'
      recognizedRole = true
      v = v.substring(4 + seperator.length)
    } else if (v.startsWith('system' + seperator)) {
      role = 'system'
      recognizedRole = true
      v = v.substring(6 + seperator.length)
    } else if (v.startsWith('assistant' + seperator)) {
      role = 'assistant'
      recognizedRole = true
      v = v.substring(9 + seperator.length)
    }
    //space/newline separators
    else if (v.startsWith('user ') || v.startsWith('user\\n')) {
      role = 'user'
      recognizedRole = true
      v = v.substring(5)
    } else if (v.startsWith('system ') || v.startsWith('system\\n')) {
      role = 'system'
      recognizedRole = true
      v = v.substring(7)
    } else if (v.startsWith('assistant ') || v.startsWith('assistant\\n')) {
      role = 'assistant'
      recognizedRole = true
      v = v.substring(10)
    } else if (index === segments.length - 1 && v === 'assistant') {
      role = 'assistant'
      recognizedRole = true
      v = ''
    }

    v = v.trim()

    const hasEnder = v.endsWith(ender)
    if (hasEnder) {
      v = v.substring(0, v.length - ender.length)
    }

    if (
      index === segments.length - 1
      && recognizedRole
      && role === 'assistant'
      && !hasEnder
      && v === ''
    ) {
      return []
    }

    const extracted = extractThoughts(v)

    return [{
      role,
      content: risuChatParser(extracted.content),
      thoughts: extracted.thoughts,
    }]
  })`,
            requires: ['parser-hardening:chatml-thought-import'],
        },
        {
            id: 'parser-hardening:chatml-terminal-marker-test',
            file: 'src/ts/parser/tests/chatML.test.ts',
            type: 'replace',
            anchor: `// FIXME: Defend against:
/*
<|im_start|>assistant
<|im_start|>assistant
*/
test.skip('parses ChatML without ending token', () => {
  expect(parseChatML('<|im_start|>assistant\\n<|im_start|>assistant')).toEqual([
    {
      role: 'assistant',
      content: '',
      thoughts: [],
    },
    {
      role: 'assistant',
      content: '',
      thoughts: [],
    },
  ])

  fc.assert(
    fc.property(
      anyRole,
      anyRole,
      anythingNotToken,
      fc.constantFrom('<|im_sep|>', '\\n', ' '),
      (role1, role2, content, sep) => {
        const input = \`<|im_start|>\${role1}\${sep}\${content}<|im_start|>\${role2}\${sep}\${content}\`
        const result = parseChatML(input)

        expect(result).toHaveLength(2)
        // In this case, since there's no <|im_end|>, trimming removes both ends
        expect(result).toEqual([
          {
            role: role1,
            content: content.trim(),
            thoughts: [],
          },
          {
            role: role2,
            content: content.trim(),
            thoughts: [],
          },
        ])
      }
    ),
    { seed: 1735332051, path: '22:0', endOnFailure: true }
  )
})`,
            content: `test('drops a terminal assistant generation marker', () => {
  expect(
    parseChatML(
      '<|im_start|>user\\nSummarize this<|im_end|><|im_start|>assistant\\n'
    )
  ).toEqual([
    {
      role: 'user',
      content: 'Summarize this',
      thoughts: [],
    },
  ])

  expect(parseChatML('<|im_start|>assistant<|im_sep|><|im_end|>')).toEqual([
    {
      role: 'assistant',
      content: '',
      thoughts: [],
    },
  ])
})

test('parses content-bearing ChatML without ending tokens', () => {
  fc.assert(
    fc.property(
      anyRole,
      anyRole,
      anythingNotToken.filter((content) => content.trim().length > 0),
      fc.constantFrom('<|im_sep|>', '\\n', ' '),
      (role1, role2, content, sep) => {
        const input = \`<|im_start|>\${role1}\${sep}\${content}<|im_start|>\${role2}\${sep}\${content}\`
        const result = parseChatML(input)

        expect(result).toHaveLength(2)
        expect(result).toEqual([
          {
            role: role1,
            content: content.trim(),
            thoughts: [],
          },
          {
            role: role2,
            content: content.trim(),
            thoughts: [],
          },
        ])
      }
    ),
    { seed: 1735332051, path: '22:0', endOnFailure: true }
  )
})`,
            requires: ['parser-hardening:chatml-parser'],
        },
        {
            id: 'parser-hardening:chatml-empty-thought-test',
            file: 'src/ts/parser/tests/chatML.test.ts',
            type: 'replace',
            anchor: `test('extracts thoughts', () => {
  // FIXME: Empty thoughts leak <Thoughts> tag
  expect(parseChatML('<|im_start|>assistant<|im_sep|><Thoughts></Thoughts> OK')).toEqual([
    {
      role: 'assistant',
      content: '<Thoughts></Thoughts> OK',
      thoughts: [],
    },
  ])`,
            content: `test('extracts thoughts', () => {
  expect(parseChatML('<|im_start|>assistant<|im_sep|><Thoughts></Thoughts> OK')).toEqual([
    {
      role: 'assistant',
      content: ' OK',
      thoughts: [],
    },
  ])`,
            requires: ['parser-hardening:chatml-parser'],
        },
        {
            id: 'parser-hardening:chatml-multiple-thoughts-test',
            file: 'src/ts/parser/tests/chatML.test.ts',
            type: 'replace',
            anchor: `// FIXME: /<Thoughts>(.+)<\\/Thoughts>/gms
//        => Matches with the whole bulk of <Thoughts>Thought 1</Thoughts> Middle <Thoughts>Thought 2</Thoughts>
test.skip('extracts multiple thoughts', () => {
  const input = \`<|im_start|>assistant<|im_sep|>Start <Thoughts>Thought 1</Thoughts> Middle <Thoughts>Thought 2</Thoughts> End<|im_end|>\`
  const result = parseChatML(input)

  expect(result).toHaveLength(1)
  expect(result?.[0]).toEqual({
    role: 'assistant',
    content: 'Start  Middle  End',
    thoughts: ['Thought 1', 'Thought 2'],
  })
})`,
            content: `test('extracts multiple thoughts', () => {
  const input = \`<|im_start|>assistant<|im_sep|>Start <Thoughts>Thought 1</Thoughts> Middle <Thoughts>Thought 2</Thoughts> End<|im_end|>\`
  const result = parseChatML(input)

  expect(result).toHaveLength(1)
  expect(result?.[0]).toEqual({
    role: 'assistant',
    content: 'Start  Middle  End',
    thoughts: ['Thought 1', 'Thought 2'],
  })
})`,
            requires: ['parser-hardening:chatml-parser'],
        },
        {
            id: 'parser-hardening:main-thought-import',
            file: 'src/ts/process/index.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { parseChatML } from "../parser/chatML";\n',
            content: 'import { extractThoughts } from "../parser/thoughts";\n',
            requires: ['parser-hardening:thought-extractor'],
        },
        {
            id: 'parser-hardening:main-thought-extraction',
            file: 'src/ts/process/index.svelte.ts',
            type: 'replace',
            anchor: `        let thoughts:string[] = []
        const maxThoughtDepth = DBState.db.promptSettings?.maxThoughtTagDepth ?? -1
        formatedChat = formatedChat.replace(/<Thoughts>(.+)<\\/Thoughts>/gms, (match, p1) => {
            if(maxThoughtDepth === -1 || (maxThoughtDepth - ms.length) <= index){
                thoughts.push(p1)
            }
            return ''
        })`,
            content: `        const maxThoughtDepth = DBState.db.promptSettings?.maxThoughtTagDepth ?? -1
        const extractedThoughts = extractThoughts(formatedChat)
        const thoughts = (
            maxThoughtDepth === -1 || (maxThoughtDepth - ms.length) <= index
        ) ? extractedThoughts.thoughts : []
        formatedChat = extractedThoughts.content`,
            requires: ['parser-hardening:main-thought-import'],
        },
        {
            id: 'parser-hardening:when-evaluator',
            file: 'src/ts/parser/whenExpression.ts',
            type: 'owned',
            content: owned('src/ts/parser/whenExpression.ts'),
        },
        {
            id: 'parser-hardening:when-evaluator-tests',
            file: 'src/ts/parser/tests/whenExpression.test.ts',
            type: 'owned',
            content: owned('src/ts/parser/tests/whenExpression.test.ts'),
        },
        {
            id: 'parser-hardening:when-import',
            file: 'src/ts/parser/parser.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: "import cssSelectorParser from 'postcss-selector-parser'\n",
            content: "import { evaluateWhenExpression } from './whenExpression'\n",
            requires: ['parser-hardening:when-evaluator'],
        },
        {
            id: 'parser-hardening:when-logical-precedence',
            file: 'src/ts/parser/parser.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `            const isTruthy = (s:string) => {
                return s === 'true' || s === '1'
            }
`,
            content: `            if(statement.some((token) => token === 'and' || token === 'or')){
                const evaluated = evaluateWhenExpression(statement, {
                    getChatVar,
                    getGlobalToggle: (name) => getGlobalChatVar('toggle_' + name),
                })
                statement.splice(0, statement.length, evaluated.condition)
                mode = evaluated.mode
            }
`,
            requires: ['parser-hardening:when-import'],
        },
        {
            id: 'parser-hardening:when-precedence-test',
            file: 'src/ts/parser/tests/cbs/conditionals.test.ts',
            type: 'replace',
            anchor: `    test.skip('Lower precedence than other operators', () => {
      // FIXME: left-hand/right-hand must be evaluated first, then or
      // Given #when::a::tis::3::or::b::tis::7
      //   AS-IS: a::tis::3 -> 1, 1::or::7 -> 1, 1::tis::7 -> 0
      //   TO-BE: a::tis::3 -> 1, b::tis::7 -> 1, 1::or::1 -> 1
      expect(quickParse('#when::3::tis::3::or::7::tis::7', 'CBS')).toBe(\`0 CBS 9\`)
    })`,
            content: `    test('evaluates comparison operators before logical operators', () => {
      expect(quickParse('#when::3::tis::3::or::7::tis::7', 'CBS')).toBe(\`0 CBS 9\`)
    })`,
            requires: ['parser-hardening:when-logical-precedence'],
        },
    ],
}
