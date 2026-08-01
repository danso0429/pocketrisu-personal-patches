# K04 prompt-role and preset-integrity overlap-equivalence audit

## Metadata

- Frozen revisions: A `63832a1`, K `cc1d1b1`, U `85a65f3`.
- Patcher/final target: `2991355`; fresh aggregate C from exact U.
- Prior claims: official 1.9 owns prompt-role normalization/UI, while `preset-integrity` owns active-index and empty-list invariants.

## Kei capability inventory

| Atom | Trigger and result | State/effects | Kei source/callers/tests |
| --- | --- | --- | --- |
| K04-P01 | Plain, jailbreak, and chain-of-thought blocks select system/user/bot and emit that request role. | Persists `PromptItem.role`; converts bot to assistant. | K `PromptDataItem.svelte`, `prompt.ts`, `index.svelte.ts` |
| K04-P02 | Persona, description, and author-note blocks can override their generated prompt role. | K persists typed `role`; runtime rewrites the selected prompt arrays. | Same surfaces |
| K04-P03 | Memory blocks can override summary prompt roles. | K typed `role` controls emitted memory prompts. | K `PromptDataItem.svelte`, `index.svelte.ts` |
| K04-P04 | Imported assistant/char aliases normalize to bot. | Normalized prompt schema survives save/reload. | K `database.svelte.ts`, `prompt.ts` |
| K04-P05 | A frozen Kei preset carrying typed `.role` retains the same typed roles when loaded by the target. | Cross-schema compatibility for K's persisted prompt-template identity. | K prompt interfaces and all normalization callers |
| K04-P06 | A lorebook template block can select a role, with per-entry role remaining authoritative where present. | K `role` controls the block default; lore entries may override it. | K `getLorebookPrompts`, prompt UI/runtime |
| K04-P07 | Empty/corrupt preset lists recover to a usable fallback preset. | Repairs array and active selection. | K preset paths; C `preset-integrity` |
| K04-P08 | Reorder/delete keeps the same preset selected by stable ID. | Stable identity rather than stale numeric position. | K preset UI; C `preset-integrity` tests |
| K04-P09 | Create/import/delete transitions leave a deterministic valid selection. | Writes preset array, ID, and active index coherently. | K preset UI/import; C native + pack owner |
| K04-P10 | Official `-1` no-active selection remains valid rather than being coerced to preset 0. | Preserves native 1.9 sentinel semantics. | C `preset-integrity` validation/tests |

## Current authority and control flow

### Kei flow

```text
prompt UI/import/database normalization
  -> PromptItem.role on plain and typed blocks
  -> prompt assembly
  -> per-block role rewrite (including lorebook default)
  -> provider request

preset create/import/reorder/delete/restore
  -> stable preset IDs and repaired active selection
  -> current preset projection
```

### Official/local/composed flow

```text
plain block -> role -> normalizePromptRole -> request role
typed persona/description/authornote/memory -> role2 -> normalization -> request role
lorebook -> native entry roles only; template role2 is neither normalized nor applied

native preset UI/storage
  + preset-integrity adapter
  -> stable IDs, empty-list repair, bounded index, preserved -1 sentinel
```

### Schema and state crosswalk

K uses `.role` for both plain and typed blocks. C uses `.role` for plain blocks and `.role2` for persona/description/authornote/memory. C's `normalizePromptTemplate` does not migrate a typed K `.role` to `.role2`, and excludes lorebook from typed normalization/application. Directly declaring the two schemas equivalent would lose persisted K state; a migration or owner-local adapter would be required.

## Equivalence matrix

| Atom | Kei evidence | Official 1.9 evidence | Local/final evidence | Disposition | Strength | Remaining observation |
| --- | --- | --- | --- | --- | --- | --- |
| K04-P01 | `.role` UI/normalize/runtime | Same role set and conversion | C retains native path | `EQUIVALENT` | source-proved | None |
| K04-P02 | Typed `.role` runtime | Native `.role2` supplies same result for native data | No local change | `EQUIVALENT` | source-proved | K-schema import is P05. |
| K04-P03 | Memory role applied | Native memory `.role2` applied | No local change | `EQUIVALENT` | source-proved | K-schema import is P05. |
| K04-P04 | assistant/char -> bot | Same aliases for `.role`/`.role2` | C retains normalizer | `EQUIVALENT` | source-proved | None |
| K04-P05 | K typed `.role` is authoritative | C reads only `.role2` | No migration in final bytes | `INCOMPATIBLE` | source-proved | User decision needed for an import/storage adapter. |
| K04-P06 | Lorebook block picker/default/runtime | Lorebook omitted from typed role handling | Direct negative UI/runtime search | `MISSING_OUTCOME` | source-proved | None |
| K04-P07 | Fallback preset | Native plus repair pack | Final candidate contains one-fallback repair | `SUPERSET_PRESERVED` | measured | None |
| K04-P08 | Stable selection on reorder/delete | Stable IDs and index repair | Focused pack test passed | `SUPERSET_PRESERVED` | measured | None |
| K04-P09 | Valid selection after create/import/delete | Native create/import plus pack guards | Complete source path and focused test | `SUPERSET_PRESERVED` | measured | None |
| K04-P10 | No-active sentinel | Official 1.9 `-1` retained | Pack explicitly avoids coercion | `SUPERSET_PRESERVED` | measured | None |

## Adversarial checks

| Scenario | Classification it could break | Method | Observed result | Limitation |
| --- | --- | --- | --- | --- |
| Empty list, invalid index, reorder/delete, `-1` sentinel | P07-P10 superset | `node --test test/preset-integrity.test.cjs`, target patcher `2991355`, exit 0 | 1 test file passed | Contract/source test, not UI taps. |
| Load `{type:'persona', role:'user'}` from K | P02/P05 equivalence | Complete normalization and runtime read | C leaves `.role` but reads only `.role2`, so the request uses its native default. | No destructive import was needed. |
| Lorebook block role plus per-entry override | P06 equivalence | UI/type/runtime caller comparison | K exposes and applies a block role; C has neither the picker nor the block application. | Provider wire capture would only reconfirm the deterministic branch. |

## Findings

| ID | Atom | Current behavior | Kei behavior | Impact/trigger | Owner | Proposed next decision |
| --- | --- | --- | --- | --- | --- | --- |
| K04-F01 | P05 | Frozen typed `.role` data is retained as an unknown field but ignored at generation. | The field controls persona/description/authornote/memory/lorebook roles. | Importing or opening a Kei-authored preset silently changes prompt roles. | Native prompt-schema owner | Recommend a one-way compatibility correction for persona/description/authornote/memory: copy `.role` to `.role2` only when native `.role2` is absent, then use the native normalizer. Keep lorebook separate. |
| K04-F02 | P06 | Lorebook block has no role picker/default override. | The block role applies unless an entry supplies its own role. | Prompt-template users cannot set a common lorebook role. | Native prompt/runtime owner | Keep as a deferred prompt-authoring feature; it is not required for the typed-role compatibility correction. |

## Conclusion

- 10 / 10 discovered atoms are mapped.
- Dispositions: 4 `EQUIVALENT`, 4 `SUPERSET_PRESERVED`, 1 `INCOMPATIBLE`, 1 `MISSING_OUTCOME`.
- No L3-required distinction remains.
- The prior decision is confirmed for native 1.9 `.role2` data and preset integrity, but corrected for frozen Kei schema compatibility and lorebook role behavior.
