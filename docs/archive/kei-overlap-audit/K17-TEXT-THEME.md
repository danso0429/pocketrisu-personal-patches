# K17 text-theme overlap-equivalence audit

## Metadata

- Frozen revisions: A `63832a1`, K `cc1d1b1`, U `85a65f3`.
- Patcher/final target: `2991355`; fresh aggregate C reproduced from exact U as recorded in the master report.
- Prior claim: K17 is structural because PocketRisu and API-v3 already expose text-theme behavior (`POCKETRISU-KEI-INTEGRATION-CATALOG.md:138`).
- Scope is limited to text-theme effects changed by K. Broad palette, settings-layout, CSS, and branding changes remain excluded.

## Kei capability inventory

| Atom | Trigger and result | State/effects | Kei source/callers/tests |
| --- | --- | --- | --- |
| K17-T01 | Selecting standard, high-contrast, or custom changes the chat text CSS variables. | Reads `db.textTheme`, color-scheme type, and custom colors; writes CSS variables. | `src/ts/gui/colorscheme.ts`; `displaySettingsData.svelte.ts` |
| K17-T02 | API-v3 can select a built-in text theme, set a validated custom theme, and read the active value. | Writes `textTheme`/`customTextTheme`; reapplies CSS. | `src/ts/plugins/apiV3/v3.svelte.ts`, `risuai.d.ts` |
| K17-T03 | Loading a database with a null or unsupported text-theme value yields `standard`. | Normalizes persisted root state. | K `src/ts/gui/textTheme.ts`; `database.svelte.ts`; `textTheme.test.ts` |
| K17-T04 | Saving, importing, or activating a theme preset normalizes its text-theme value. | Prevents an invalid preset value from becoming active or being re-saved. | K `database.svelte.ts` theme-preset paths |
| K17-T05 | Applying CSS defensively normalizes a corrupted in-memory value to `standard`. | Ensures a supported switch branch writes every expected font-color variable. | K `colorscheme.ts:updateTextThemeAndCSS` |

## Current authority and control flow

### Kei flow

```text
database/preset/API/UI input
  -> normalizeTextTheme (supported value or standard)
  -> db.textTheme/customTextTheme
  -> updateTextThemeAndCSS
  -> chat font-color CSS variables
```

### Official/local/composed flow

```text
database input -> nullish-only default -> db.textTheme
theme preset input -> value copied without validation -> db.textTheme
UI/API input -> constrained picker/API validation -> db.textTheme
updateTextThemeAndCSS -> switch raw value -> CSS variables only for a known case
```

C and U have the three-mode UI, custom editor, CSS branches, and API-v3 methods. They do not contain K's normalizer or a replacement caller.

### Schema and state crosswalk

Both sides use `textTheme: string` and the same six custom color fields. The difference is not schema ownership: K constrains every load/preset/runtime boundary, whereas C constrains only UI/API inputs and nullish database values.

## Equivalence matrix

| Atom | Kei evidence | Official 1.9 evidence | Local/final evidence | Disposition | Strength | Remaining observation |
| --- | --- | --- | --- | --- | --- | --- |
| K17-T01 | Same three CSS branches | Same picker and branches | C retains U bytes | `EQUIVALENT` | source-proved | Visual color sampling is optional, not needed to distinguish code paths. |
| K17-T02 | Validated API methods | Same methods and six-field validation | No local replacement | `EQUIVALENT` | source-proved | None |
| K17-T03 | Root normalization accepts only three values | Only nullish values default | Direct negative search in C | `MISSING_OUTCOME` | measured | None |
| K17-T04 | Theme save/import/switch normalizes | Raw preset value copied | Direct caller comparison | `MISSING_OUTCOME` | source-proved | None |
| K17-T05 | Runtime CSS call normalizes again | Switches raw value | Direct caller comparison | `MISSING_OUTCOME` | source-proved | None |

## Adversarial checks

| Scenario | Classification it could break | Method | Observed result | Limitation |
| --- | --- | --- | --- | --- |
| Supported and invalid values | K17-T01/T03 equivalence | Bundled exact K helper with esbuild, invoked six inputs, exit 0 | `standard`, `highcontrast`, and `custom` were preserved; `undefined`, `null`, and `vex` became `standard`; bundle SHA-256 `e4db479efc334f44bac09f66b9385d01de2766a1e329ff3f7040521418439800` | Measures K helper, not DOM CSS. |
| Corrupt imported preset value | K17-T04 equivalence | Complete source path comparison | K normalizes before storing; C pushes/copies the raw value. | No mutation fixture was run because the source branch is deterministic. |
| Corrupt live value | K17-T05 equivalence | Direct switch/caller comparison | C has no default branch and does not rewrite standard variables; K first normalizes. | Existing CSS may mask the defect until a reload/theme change. |

Reproduction: from exact K, `npx esbuild src/ts/gui/textTheme.ts --bundle --platform=node --format=cjs --outfile=/tmp/kei-overlap-text-theme.cjs`, then invoke `normalizeTextTheme` for the six recorded inputs. Both commands exited 0.

## Findings

| ID | Atom | Current behavior | Kei behavior | Impact/trigger | Owner | Proposed next decision |
| --- | --- | --- | --- | --- | --- | --- |
| K17-F01 | T03-T05 | Unsupported non-null values survive load/preset activation and select no CSS branch. | They become `standard` at load, preset, and CSS boundaries. | Malformed/older/plugin-written database or imported theme preset can retain stale text colors. | Native database/theme owner | Recommend a small owner-local compatibility correction at load/preset/runtime boundaries; accept only the three native values and fall back to `standard`. Do not reopen broad K17. |

## Conclusion

- 5 / 5 discovered atoms are mapped.
- Dispositions: 2 `EQUIVALENT`, 3 `MISSING_OUTCOME`.
- No L3-required atom remains; the invalid-value distinction is source-proved and the K helper was measured.
- The prior structural exclusion is narrowed: the broad K17 refactor stays excluded, but its defensive text-theme normalization was a distinct omitted result.
