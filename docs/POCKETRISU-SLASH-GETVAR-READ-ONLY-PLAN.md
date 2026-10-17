# Slash `getvar` read-only plan

Status: reviewed draft awaiting approval, 2026-10-18 (KST). Not implemented.
A read-only adversarial review confirmed the quoted code and line numbers,
anchor uniqueness, behavioral equivalence and absence of readers relying on
the mutation, and added the anchor newline rule, the named version pins, the
full mock list and the wrong-reason `TypeError` guard now included below.

## 1. Problem

`src/ts/process/command.ts`, `processCommand`, `case 'getvar'` (installed lines
222–230, identical to pristine PocketRisu 1.10.0 apart from line offsets):

```ts
case 'getvar':{
    const db = getDatabase()
    const selectedChar = get(selectedCharID)
    const char = db.characters[selectedChar]
    const chat = char.chats[char.chatPage]
    chat.scriptstate = chat.scriptstate ?? {}
    pipe = (chat.scriptstate['$' + namedArg['key']]).toString() ?? 'null'
    return pipe
}
```

A read creates `scriptstate = {}` on a chat that had none. `getDatabase()`
returns the live database object, so the mutation stays in memory and is sent
to the server by the next save. The BG commit compares `scriptstate` presence
between the assembly snapshot and the latest canonical chat
(`lazy-chat-bg-adapter` `serverChatAssemblyContext.cjs`), so a read during a
background generation can produce the "conversation changed after
preparation" warning without any user edit. This is the same class of defect
fixed for native `getChatVar` in `0.2.4-experimental.54`
(`lazy-chat-bg-adapter:assembly-variable-read-only:1.10`).

Whether this path caused the warning observed on 2026-10-18 is not known; the
`[bg-assembly]` diagnostic of `0.2.4-experimental.61` will name the changed
field at the next occurrence. The fix is justified independently: a read must
not change state.

## 2. Where it runs

- User input starting with `/` (`src/lib/ChatScreens/DefaultChatScreen.svelte`
  ~640 → `processMultiCommand`).
- Trigger effects `command` and `v2Command` (`src/ts/process/triggers.ts`
  ~1377, ~1850), reached from triggers run at send start, input, output and
  manual invocation.
- The server-side BG bundle contains the same case
  (`server/node/bgOrchBundle.mjs`, built from source); it is rebuilt at
  delivery.

CBS `{{getvar::}}` uses native `getChatVar` (already fixed) and is not affected.

## 3. Change

Replace the two lines (installed 227–228) with:

```ts
pipe = (chat.scriptstate?.['$' + namedArg['key']]).toString() ?? 'null'
```

- A present variable returns the same string as before.
- A missing variable still throws `TypeError` from `.toString()` on
  `undefined`, as before. Changing that behavior is out of scope.
- `setvar` and `addvar` keep creating `scriptstate`; they are writes.

## 4. Delivery in the patcher

- Pack: `lazy-chat-bg-adapter` (owner of the assembly-context warning and of
  the earlier `getChatVar` fix).
- Unit `lazy-chat-bg-adapter:slash-getvar-read-only:1.10`, type `replace`, file
  `src/ts/process/command.ts`, following the earlier
  `assembly-variable-read-only:1.10` unit (`patches/lazy-chat-bg-adapter/manifest.cjs`
  ~42–47):
  - `anchor`: `"            chat.scriptstate = chat.scriptstate ?? {}\n            pipe = (chat.scriptstate['$' + namedArg['key']]).toString() ?? 'null'"`
    — both lines with their 12-space indentation, ending at the end of the
    second line WITHOUT the trailing newline;
  - `content`: `"            pipe = (chat.scriptstate?.['$' + namedArg['key']]).toString() ?? 'null'"`.
  - Reason for omitting the trailing newline: `markedBlock` (`src/compose.cjs`
    ~78–82) appends a newline to the content and then the END marker; an
    anchor that includes the newline would glue the END marker to the next
    code line (as already seen at installed `command.ts:252`). With the
    newline left outside the anchor, the original newline follows the END
    marker.
  - The first line alone occurs three times (`setvar` 200, `addvar` 214,
    `getvar` 227); the two-line anchor occurs once, in the installed file and
    in pristine 1.10.0 (216–217). Both lines use 12 spaces; the file has no CR.
- Other units on the same file: `haejeok-persistence-safety-adapter` import
  (installed 13–17) and trigger publication (237–252), `bg-preserve`
  multisend (180–185). None overlaps 222–230; the composed plan must report no
  collision error.
- Tests: no upstream test file exists for `command.ts`, and no existing test
  imports it. Add `src/ts/process/commandVariableRead.test.ts` under
  `patches/lazy-chat-bg-adapter/files-1.10/` and register it in the adapter's
  `owned1100(...)` list (`manifest.cjs` ~128–141). `owned1100` reads the file
  when the manifest loads, so the file must exist before registration; the
  composer writes owned files only where the target file is absent
  (`compose.cjs` ~123–131). `vitest.config.ts` runs `src/ts/process` tests by
  default.
- Versions: `lazy-chat-bg-adapter` 0.7.61 → 0.7.62 (`manifest.cjs:28`) and its
  two literal pins `test/bg-independent-g1.test.cjs:17` and
  `test/g22a-capability.test.cjs:39`; `package.json` `0.2.4-experimental.61` →
  `.62`; CHANGELOG entry in the existing form (`## <version> (<title>)`,
  bullets, last bullet `BG adapter 0.7.62. Stable remains v0.2.3.`); installer
  rebuilt with `npm run build` (`scripts/build-installers.cjs`).

## 5. Tests

Entry point: exported `processMultiCommand('/getvar key=<name>')`; the parser
splits on spaces and reads `key=value` pairs (`commandParser`, installed
~317–339). Mock every module `command.ts` imports (installed lines 1–17):
`svelte/store` stays real; `../storage/database.svelte` (`getDatabase`
returning a fixture with one character whose `chatPage` points at one chat,
`setDatabase`, `getCurrentCharacter`, `getCurrentChat`, `setCurrentChat`);
`../stores.svelte` (`selectedCharID` as a writable at index 0);
`../parser/parser.svelte` (`risuChatParser` returns its input); `../alert`
(including `notifyError`); `./tts`; `./index.svelte` (`sendChat`);
`./generationState`; `./lorebook.svelte`; `./triggers`;
`../storage/chatSaveRebase`. Existing tests that mock the same modules:
`src/ts/process/regexImportMultiplicity.test.ts` (database, triggers) and
`suggestionRecovery.test.ts` (index.svelte). The patched lines run unmocked.

`processCommand` reads the current character and chat before the switch
(installed ~50–52). A wrong fixture would also throw `TypeError` and let tests
1–2 pass for the wrong reason. Therefore tests 1–2 assert the error message
refers to reading `toString` (V8 wording "Cannot read properties of undefined
(reading 'toString')"), and test 3 proves the fixture reaches the `getvar`
case.

| # | Setup | Action | Expected | Old code |
|---|---|---|---|---|
| 1 | chat without `scriptstate` | `/getvar key=k` | rejects with a `TypeError` about reading `toString`; chat has no own `scriptstate` | fails (key created) |
| 2 | `scriptstate: null` | `/getvar key=k` | rejects with a `TypeError` about reading `toString`; `scriptstate` still `null` | fails (replaced by `{}`) |
| 3 | `scriptstate: { $k: 'v' }` | `/getvar key=k` | resolves `'v'`; chat deep-equal to before | passes |
| 4 | chat without `scriptstate` | `/setvar key=k x` | `scriptstate.$k === 'x'`; `setDatabase` called | passes |

Tests 1 and 2 must fail on the old code for the stated reason; 3 and 4 guard
unchanged behavior.

Equivalence for every `scriptstate` value (old vs new, by code reading):
absent/undefined and `null` throw in both, and only the old code writes `{}`;
`{}` or an object without the key throws in both without mutation; an object
with the key returns the same `toString()` result (a stored `null`/`undefined`
throws in both); non-object values (string, number, array) yield `undefined`
for a `$`-prefixed key and throw in both. No code reads `scriptstate` assuming
`getvar` created it (`DevTool.svelte` ~136 guards; `chatVar.svelte.ts` and
`triggers.ts` initialize before writing).

## 6. Checks

- Isolated copy of the installed tree: apply the new installer; follow-up plan
  0 changes; installed `command.ts` contains the unit START and END markers
  once, each on its own line, with `case 'test_lorebook'` unchanged after the
  block.
- Run the new test file against the tree BEFORE applying the code unit (only
  the test file copied in) to confirm tests 1–2 fail for the mutation and 3–4
  pass; then apply and confirm all pass.
- New tests; existing `src/ts/parser/tests/chatVar.svelte.test.ts`; full
  frontend suite with no new failures against a baseline run; `svelte-check
  --threshold error` 0 errors; patcher `npm test`; installer build.
- Review: full diff, unit anchor, test fixture realism.

## 7. Must stay unchanged

Return values and errors of `getvar`; all other slash commands; `setvar` /
`addvar` writes; BG bundle behavior apart from the rebuilt `getvar` case.

## 8. Risk and flow

Risk: normal (one upstream file, one anchored unit, one owned test file; not a
persistence or sync path). Flow: implementation and tests by one implementer
subagent, review, commit; push and live apply only after separate approval.
Delivery includes the BG bundle rebuild.

## 9. Out of scope

- The `TypeError` for a missing variable.
- Other writers of compared fields (`setChatVar`, triggers, lore writes,
  normalizers); normalizers were assessed as not reaching the server's chat
  store between assembly and commit (partly inferred).
