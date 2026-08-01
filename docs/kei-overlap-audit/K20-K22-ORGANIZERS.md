# K20/K22 organizer overlap-equivalence audit

## Metadata

- Frozen revisions: A `63832a1`, K `cc1d1b1`, U `85a65f3`.
- Final candidate: exact U plus aggregate patcher graph at `2991355`.
- Prior claims: `character-organizer` and `persona-organizer` remain the only folder/order/schema owners; omitted presentation atoms were said not to require current units.

## Kei capability inventory

| Atom | Trigger and result | State/effects | Kei source/callers/tests |
| --- | --- | --- | --- |
| K20-C01 | Search characters by normalized displayed name. | Query filters catalog; no data mutation. | K `GridCatalog.svelte`, `MobileCharacters.svelte` |
| K20-C02 | Sort/show recent characters by last interaction. | Reads chat activity and recent state. | Same |
| K20-C03 | Show chat count and relative last-interaction time. | Derived presentation metadata. | K catalog UI |
| K20-C04 | Switch simple/grid/list/trash presentations. | Presentation-only mode state. | K catalog UI |
| K20-C05 | Reorder characters and organize non-destructive folder membership. | Writes canonical character order/folder references. | K ordering UI/state |
| K20-C06 | Grid tiles show the character name and explicit selected state. | Visual selection affordance. | K `GridCatalog.svelte` |
| K20-C07 | One recent/simple view combines recency/chat metadata with expandable creator notes. | Presentation-only combined view. | K catalog UI |
| K22-P01 | Persona folders/order survive normalize/import/export and icon/gallery asset flows. | Canonical IDs, folder references, persona assets. | K persona UI/state |
| K22-P02 | Reorder and move personas between folders. | Writes persona order and `folderId`. | K `PersonaSettings.svelte` |
| K22-P03 | Bound/unbound persona selection and notes remain visible. | Updates selected persona/binding state. | K `PersonaBind.svelte` |
| K22-P04 | Persona selection picker searches name and note. | Query-only state. | K `listedPersona.svelte` |
| K22-P05 | Selection picker filters and acts within a chosen folder. | Reads folder membership; actions preserve folder. | Same |
| K22-P06 | Create/import from a selected folder assigns the new persona to it. | New persona receives selected `folderId`. | K persona picker/settings |
| K22-P07 | Duplicate a persona from the picker/settings. | New stable persona identity with copied editable fields. | K persona UI |
| K22-P08 | Persona note is shown in the picker/binding presentation. | Read-only presentation. | K picker/bind UI |
| K22-P09 | Persona deletion cleans references without deleting unrelated assets/personas. | Referential safety and non-destructive ownership. | K state paths; local organizer owner |

## Current authority and control flow

### Kei flow

```text
catalog/picker query + view/folder selection
  -> filtered ordered character/persona identities
  -> presentation metadata/actions
  -> canonical order/folder/persona writes
```

### Official/local/composed flow

```text
native GridCatalog
  -> name search + recent sort + chat metadata + simple/grid/list/trash modes
character-organizer
  -> canonical characterOrder + folder membership + 4x4 pages

persona-organizer
  -> canonical personaFolders/folderId + normalize/import/export/assets
  -> PersonaSettings folder/order/gallery UI
native listedPersona picker
  -> flat persona list without search/folder/actions
```

### Schema and state crosswalk

C's character and persona organizer schemas are the only final write owners and preserve K's non-destructive folder/order intent. No second schema is needed. The gaps are presentation/action triggers in final host bytes. `SideChatList.svelte` was listed under K20 in the earlier inventory, but its frozen K change is chat-folder behavior, not character-organizer overlap; it is removed from this receipt rather than treated as K20 evidence.

## Equivalence matrix

| Atom | Kei evidence | Official 1.9 evidence | Local/final evidence | Disposition | Strength | Remaining observation |
| --- | --- | --- | --- | --- | --- | --- |
| K20-C01 | Normalized name query | Native name search | Present in final GridCatalog | `EQUIVALENT` | measured | None |
| K20-C02 | Recent by last interaction | Native recent mode | Present in final GridCatalog | `EQUIVALENT` | source-proved | None |
| K20-C03 | Count/relative time | Native metadata | Present in final simple view | `EQUIVALENT` | source-proved | None |
| K20-C04 | Multiple views | Native modes plus trash | Final owner adds paged folder view | `SUPERSET_PRESERVED` | source-proved | None |
| K20-C05 | Folder/order | Partial native order | `character-organizer` canonical owner | `SUPERSET_PRESERVED` | measured | None |
| K20-C06 | Named, selected grid tile | Native image grid omits names and selected styling for image tiles | No local adapter | `MISSING_OUTCOME` | source-proved | None |
| K20-C07 | Combined recent metadata + notes | Native splits metadata and notes across modes | No combined final presentation | `MISSING_OUTCOME` | source-proved | None |
| K22-P01 | Folder/order/assets round trip | Partial native fields | Local normalization/import/export/gallery owner | `SUPERSET_PRESERVED` | measured | None |
| K22-P02 | Reorder/folder move | Partial native list | Local organizer owns both | `SUPERSET_PRESERVED` | measured | None |
| K22-P03 | Bind/unbind selection | Same native component behavior | Final retains it | `EQUIVALENT` | source-proved | None |
| K22-P04 | Picker name/note search | Flat native picker | Direct negative final-host search | `MISSING_OUTCOME` | source-proved | None |
| K22-P05 | Picker folder filter/actions | Flat native picker | No local picker adapter | `MISSING_OUTCOME` | source-proved | None |
| K22-P06 | Create/import into selected folder | K assigns selected folder | C creates/imports unfiled | `MISSING_OUTCOME` | source-proved | None |
| K22-P07 | Duplicate persona | K action present | No final action | `MISSING_OUTCOME` | source-proved | None |
| K22-P08 | Note presentation | K picker/bind | Native bind and final settings show note | `EQUIVALENT` | source-proved | None |
| K22-P09 | Referentially safe deletion | K cleanup | Local owner additionally normalizes refs/assets | `SUPERSET_PRESERVED` | measured | None |

## Adversarial checks

| Scenario | Classification it could break | Method | Observed result | Limitation |
| --- | --- | --- | --- | --- |
| Character folder/order plus native catalog controls | C01-C05 | Combined `node --test test/character-ui.test.cjs test/persona-ui.test.cjs`, patcher `2991355`, exit 0 | Both files passed; owner/schema assertions held. | UI layout was source-read, not tapped. |
| Persona normalize/import/export/delete | P01/P02/P09 | Same combined command | Both files passed; persona round-trip assertions held. | Does not exercise pointer drag. |
| Search/folder picker/actions | P04-P07 | Complete final `listedPersona.svelte` and settings caller read plus negative symbol search | Final picker is a short flat list; no search, folder filter, selected-folder creation/import, or duplicate branch exists. | Presence is decided without L3. |
| Character grid selection/name | C06 | Render branch comparison | Image-backed tiles contain the image control without K's explicit name/selected affordance. | Exact visual salience remains subjective, presence does not. |

## Findings

| ID | Atom | Current behavior | Kei behavior | Impact/trigger | Owner | Proposed next decision |
| --- | --- | --- | --- | --- | --- | --- |
| K20-F01 | C06/C07 | Grid presentation omits explicit name/selection on image tiles and splits recent metadata from notes. | Both affordances are present in K. | Character selection in dense/image-heavy catalogs is less explicit. | `character-organizer` UI owner | Keep both as deferred presentation variants; they do not affect organizer schema or selection correctness. |
| K22-F01 | P04-P07 | Selection picker is flat; new/imported personas are unfiled; no duplicate action. | Search, folder scope, selected-folder creation/import, and duplicate are available. | Large persona libraries lose organization context at the actual selection point. | `persona-organizer` UI owner | Recommend P04-P06 as an owner-local coherence enhancement using the existing folder/order schema; keep duplicate P07 as a separate deferred convenience feature and preserve asset/reference cleanup. |

## Conclusion

- 16 / 16 discovered atoms are mapped.
- Dispositions: 5 `EQUIVALENT`, 5 `SUPERSET_PRESERVED`, 6 `MISSING_OUTCOME`.
- No L3-required presence question remains.
- Canonical organizer ownership is confirmed, while both “missing controls are deferred” summaries need correction: character search/recent/view are already native, and the concrete remaining presentation outcomes are listed above.
