# CSS editor text projection

Candidate: `0.2.3-experimental.3`, Personal settings `0.5.2`, PocketRisu 1.10.0.

The shipped CSS editor now hides the item's owned `html[data-pocketrisu-css]`
activation prefix. Custom items accept ordinary CSS and never receive a
generated ID or wrapper in their editor text. Runtime style-node ownership
continues to enforce activation, master/Safe Mode, and recovery gates.

The projection is local to an open draft. No database migration is performed.
An unchanged CSS draft returns the original source bytes, including when only
the name or description changes. For declaration edits, unchanged selectors
recover their original forms and specificity by ordered selector occurrence.
New or changed selectors use their authored CSS. Nested style rules and
keyframe selectors do not receive prefixes from unrelated top-level rules.

Only the current shipped item's recognized leading activation selector is
hidden. Custom CSS, other tokens, real `html` selectors, comments, strings,
and at-rules remain authored content. Unsupported or malformed CSS falls back
to its original text instead of a guessed textual replacement. Such authored
text can still contain `html` or an attribute selector; this is not a required
format for new CSS.

PostCSS 8.5.6 and postcss-selector-parser 7.1.1 were already present in the
target lockfile. Their parse/walk and selector-node APIs were checked against
official documentation and the installed implementation. Parsing explicitly
uses `map: false`; no source-map loading or remote transformation is added.

## Observed validation

- Patcher: 51 test files passed. Original shipped stylesheet equivalence
  fixtures remain unchanged.
- Personal runtime/editor: 86 tests passed in the complete graph, including
  eight projection tests for exact unchanged round trip, declaration edits,
  selector changes, custom source, strings/comments, at-rules, duplicate
  selectors, nested rules, keyframes, and malformed drafts.
- Standalone, startup, lazy, BG/lazy, and complete graphs passed transactional
  apply, current status, zero-change reapply, compatibility UI rollback, old
  reader preservation, and exact managed byte/mode restoration. The complete
  graph contains 42 packs, 981 units, 363 paths, and 13 ordered collisions.
- Svelte diagnostics: zero errors and zero warnings. Production build: 7,985
  modules. A type-only parent-union correction followed the browser build;
  final diagnostics and graph tests used that correction.
- Actual built-app Chromium at 390px, using the isolated native SQLite server:
  all ten shipped editors omitted the internal prefix; a declaration change
  saved durably with its original runtime selector; reload reopened ordinary
  editor text; a new custom editor was empty and accepted ordinary CSS.
  No page errors were observed. Physical iPhone qualification remains pending.
- Two installer builds were byte-identical; both aliases are 8,114,330 bytes,
  mode 0755, SHA-256
  `ce0e76206a2950e577474f79977bddeead6d314b2eefb1ca0b227344d80d64a3`.

## Runtime audit

Discovery followed draft open → selector projection → textarea edits → source
reconstruction → existing trial/persistence → reload. Effects are confined to
the edited CSS field and the existing bounded appearance mutation.

| Adversarial case | Anchor / outcome |
| --- | --- |
| Merely opening/saving changes source or conflicts with a sibling update | Original bytes and original `cssEditBase` are retained; unchanged round-trip tests and the existing current-root conflict path remain active. |
| Declaration editing changes selector priority | Original selector forms are recovered; unit tests and real stored/runtime browser text verify this. |
| A comma in a functional selector, string, or comment is treated as a rule boundary | CSS and selector parsers handle their own grammars; nested-media and string/comment fixtures pass. |
| An old prefix leaks into a new nested rule or keyframe | Ancestor-rule/keyframe exclusion and an adversarial fixture pass. |
| Parsing fails and silently discards source | The draft/original text is returned intact; malformed fixtures pass. |
| Hidden text changes a saved snapshot after confirmation | Reconstruction happens before `submitCssEdit`; the existing full-snapshot trial and strict acknowledgement own the exact saved CSS. |

No new server route, database writer, asset operation, or user-data migration
was introduced. The full feature's recovery and rollback boundaries remain in
`POCKETRISU-PERSONAL-CSS-TOGGLE-EDITOR-VALIDATION.md`.
