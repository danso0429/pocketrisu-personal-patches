# K23 regex/lorebook overlap-equivalence audit

## Metadata

- Frozen revisions: A `63832a1`, K `cc1d1b1`, U `85a65f3`.
- Final owner claim: `bg-preserve`'s `customscript.types[]` is canonical; K's duplicate single-type representation must not become a second schema.
- Final candidate: aggregate C from exact U and patcher `2991355`.

## Kei capability inventory

| Atom | Trigger and result | State/effects | Kei source/callers/tests |
| --- | --- | --- | --- |
| K23-R01 | One logical regex can run in multiple selected directions, including input/output/process/display/translation modes. | K stores compatible single-type records and groups them for UI; runtime still executes each mode. | `RegexData.svelte`, `regexScriptGroups.ts`, `scripts.ts`, translator |
| K23-R02 | Export to vanilla data emits one single-type record per selected direction. | Portable schema contains no local-only multi-type field. | K grouping/export helper |
| K23-R03 | Importing equal-content records with distinct directions presents one multi-direction logical regex without losing a direction. | Groups by shared editable fields and distinct type. | K helper and tests |
| K23-R04 | Two equal-content records with the same direction remain two executions after import. | Duplicate identity/multiplicity is preserved. | K helper explicitly does not collapse same-type duplicates. |
| K23-R05 | The editor presents compatible records as one logical multi-direction item. | UI grouping only; vanilla records remain representable. | `RegexList.svelte`, `RegexData.svelte` |
| K23-R06 | Editing a logical group keeps a stable primary and synchronizes shared fields without replacing unrelated identities. | Writes every member while preserving the chosen primary/object ordering. | K `regexScriptGroups.ts` |
| K23-R07 | Delete and reorder operate on the entire logical group. | All member records move/delete together. | K regex UI/helper |
| K23-R08 | Regex list search filters by the user-visible regex fields. | Presentation-only query state. | K regex list UI |
| K23-L01 | A lorebook entry selects system/user/assistant and generation emits that role, including group inheritance. | Adds persisted entry `role`; changes prompt role. | K lorebook data/list/process paths |
| K23-L02 | Header activation control cycles off/always/selective with left/right pointer actions. | Writes activation mode without opening each entry. | K lorebook list UI |
| K23-L03 | Lorebook list names can be edited inline. | Writes the visible entry name from list mode. | K `listEditMode` paths |
| K23-L04 | Bulk lorebook activation changes multiple selected entries. | Batch writes activation flags. | K and native lorebook settings |

## Current authority and control flow

### Kei flow

```text
vanilla duplicate single-type records
  -> group compatible records for one editor row
  -> add/remove a direction by adding/removing one record
  -> sync common fields, preserve duplicate same-type records
  -> runtime/translator dispatch each stored type

lorebook UI -> entry activation/name/role -> lorebook prompt assembly -> request role
```

### Official/local/composed flow

```text
import single-type records
  -> merge by [comment,in,out,flag,ableFlag]
  -> one customscript with types[] (type fallback retained)
  -> scriptModes() -> runtime and translator dispatch
  -> export splits types[] back to vanilla records

native lorebook UI/process
  -> activation flags and bulk actions
  -> content-level @@role directives where authored
  -> no persisted per-entry role picker, quick header cycle, or inline list-name editor
```

### Schema and state crosswalk

K's canonical stored unit remains a single `type` record and its UI group owns several object identities. C's canonical unit is one object with `types[]`. For distinct directions, that one canonical object directly provides the logical editor row, shared-field edit, whole-logical-item delete, and whole-logical-item reorder effects that K obtains through a multi-object group. The representation and mechanism differ, but no separate group adapter is needed for those effects. C's import merge still collapses equal same-direction duplicates because the merge key omits identity and multiplicity.

## Equivalence matrix

| Atom | Kei evidence | Official 1.9 evidence | Local/final evidence | Disposition | Strength | Remaining observation |
| --- | --- | --- | --- | --- | --- | --- |
| K23-R01 | Group directions execute through existing dispatch | Native single type | `types[]` + `scriptModes()` reaches runtime and translator | `EQUIVALENT` | source-proved | None |
| K23-R02 | Split group on export | Native single-type export | C explicitly splits `types[]` | `EQUIVALENT` | source-proved | None |
| K23-R03 | Distinct directions grouped | Native separate records | C merges them into one `types[]` record | `EQUIVALENT` | measured | Identity differs, result does not. |
| K23-R04 | Same-type duplicates are separate groups/executions | Native preserves records | C import merge collapses them | `MISSING_OUTCOME` | measured | None |
| K23-R05 | One logical grouped editor row | Native separate rows | C's canonical `types[]` object renders as exactly one row, including after R03 import merge | `EQUIVALENT` | source-proved | Representation differs; visible grouping effect is preserved. |
| K23-R06 | Stable primary plus multi-object synchronized edit | Native object-per-record | C edits the one canonical object shared by all selected modes, preserving its identity and unrelated rows | `EQUIVALENT` | source-proved | K's multi-object synchronization mechanism is unnecessary under C's schema. |
| K23-R07 | Group-wide reorder/delete | Native per-record controls | C's keyed row delete and Sortable reorder move/delete the one canonical multi-mode object | `EQUIVALENT` | source-proved | Equal same-direction multiplicity remains the separate R04 gap. |
| K23-R08 | Regex search | No native search | Direct negative search in C | `MISSING_OUTCOME` | source-proved | None |
| K23-L01 | Entry role field/picker/runtime | Content directives only | No entry role field or picker | `MISSING_OUTCOME` | source-proved | Decide interaction with K04 lorebook block roles. |
| K23-L02 | Left/right activation cycle | Separate native controls | No matching pointer cycle | `MISSING_OUTCOME` | source-proved | L3 could evaluate desirability, not presence. |
| K23-L03 | Inline name edit | Edit form only | No `listEditMode` in C | `MISSING_OUTCOME` | source-proved | None |
| K23-L04 | Bulk activation | Native settings action | C retains native action | `EQUIVALENT` | source-proved | None |

## Adversarial checks

| Scenario | Classification it could break | Method | Observed result | Limitation |
| --- | --- | --- | --- | --- |
| Two directions with equal shared fields | R03 equivalence | Exact K helper bundled by esbuild and asserted in Node, exit 0 | One logical group and two vanilla records were observed. | Measures K grouping; C result follows complete import implementation read. |
| Two identical same-direction records | R04 equivalence | Same harness | Four input records remained four K groups; C merge key and `types[]` set have no multiplicity slot. | No live generation cost was incurred. |
| Edit synchronized group fields | R06 | Same harness | Shared edit changed every member while retaining group structure. | This proves K's mechanism; C's simpler canonical-object effect is checked in the next row. |
| Canonical multi-mode row edit/delete/reorder | R05-R07 equivalence | Complete C `RegexData.svelte` and `RegexList.svelte` read at aggregate C | One `types[]` object renders as one keyed row; edits bind to that object, delete splices it once, and Sortable reorders it once. | Source-proved; pointer drag was not rerun because the question is group cardinality, not drag mechanics. |
| Lorebook role versus content directive | L01 equivalence | Schema/UI/caller comparison | K field changes prompt role; C's `@@role` requires authored content and is not the same trigger/state. | None |

Harness artifact: `/tmp/kei-overlap-harness.q8rrFD/regexScriptGroups.cjs`, SHA-256 `2e927649009bb65c76f57407799cbdf3411118f9c25ef6cd3ddff00ea3ed827c`; assertions exited 0 with `{"grouped":1,"vanillaRecords":2,"duplicateGroups":4,"synced":"changed"}`.

## Findings

| ID | Atom | Current behavior | Kei behavior | Impact/trigger | Owner | Proposed next decision |
| --- | --- | --- | --- | --- | --- | --- |
| K23-F01 | R04 | Import can collapse equal same-direction records into one execution. | Repeated same-type records remain repeated executions. | Importing modules/presets that intentionally repeat a regex changes output. | `bg-preserve` regex-schema owner | Recommend an owner-local import correction: merge only into a bucket whose modes are disjoint; overlapping same-direction entries start another canonical row. No second schema or persisted identity field is required. |
| K23-F02 | R08 | No regex-list search surface. | Search filters user-visible regex fields. | Larger regex collections cannot be filtered by name/pattern/replacement. | Regex UI owner | Treat search as an optional owner-local presentation delta; do not add a second grouping schema. |
| K23-F03 | L01-L03 | No entry role, quick activation cycle, or inline list-name edit. | All three are available. | Lorebook authoring and prompt-role control are narrower. | Native lorebook owner | Keep as deferred lorebook-authoring features. If later admitted, coordinate L01 with K04-F02 and leave regex ownership untouched. |

## Conclusion

- 12 / 12 discovered atoms are mapped.
- Dispositions: 7 `EQUIVALENT`, 5 `MISSING_OUTCOME`.
- No presence/absence distinction needs L3.
- The canonical `types[]` owner is confirmed. The prior “no independently specified missing outcome” conclusion is still corrected, but grouped row/edit/delete/reorder are simpler equivalent effects rather than missing atoms.
