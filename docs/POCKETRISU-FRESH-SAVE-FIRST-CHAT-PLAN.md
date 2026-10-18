# Fresh-save first chat plan

Status: reviewed draft awaiting approval, 2026-10-18 (KST). Not implemented.
A read-only adversarial review confirmed the fresh-branch condition, that
`POST /api/chat-content` creates a chat without requiring the character in the
server database (it stages the chat until metadata commits), that writing
`{characters: []}` changes no runtime default, that no existing test asserts
the fresh bytes, and that non-fresh installs are untouched. Its corrections
(the residual empty-row case, the anchor file that must stay unchanged, line
numbers and version pins) are included below.

## 1. Problem (reproduced in an isolated install)

On a brand-new install, the first chat of a character created with "Create
from Scratch" never saves:

1. `bootstrap.ts` finds no server database and writes
   `encodeRisuSaveLegacy({})`; the patch-sync baseline is the decoded `{}`.
2. `globalApi.svelte.ts` initializes `lastConfirmedServerDb` from that baseline,
   so it has no `characters` key.
3. `classifyChatSaveIntent` (`chatSaveIntent.ts:37`) returns `'update'` because
   `characters` is not an array.
4. `saveChatContentAttempt` (`nodeStorage.ts` ~1486–1524) probes
   `GET /api/chat-content`, receives 404 (the server has no such character)
   and, for an update, throws `ChatConflictError('Chat was removed on the
   server')`.
5. The save batch stops before the database patch, so `lastConfirmedServerDb`
   never gains `characters`, and the autosave repeats the same failure about
   every 1.5 s.

Pristine PocketRisu 1.10.0 has no create/update classification and saves
normally. On a database that already has a `characters` array the same
sequence classifies the chat as `'create'`, receives the expected 404, creates
it and saves (observed).

## 2. Constraints from the existing design

- The `'update'` result for a missing `characters` array is a deliberate
  fail-closed rule: "Missing or malformed confirmed baseline state fails closed
  to update" (`docs/NEW-CHAT-SAVE-REGRESSION-2026-07-26.md`), so that a 404 is
  never treated as permission to recreate a remotely deleted chat. The test
  `chatSaveIntent.test.ts` ("fails closed to update when no valid confirmed
  baseline exists") encodes it.
- The server already treats this exact case: `canonicalizeStrippedDatabase`
  (`chatDelta.cjs` ~113–127) adds `characters: []` only when the key is
  absent, with the comment "A brand-new client may persist the encoder's empty
  object before runtime defaults create `characters`." `/api/write` applies it,
  so after the first-run write the server holds `{characters: []}` while the
  client's confirmed copy is `{}`.

## 3. Options

| Option | Change | Assessment |
|---|---|---|
| A | Normalize every confirmed copy to `characters: []` | Rejected: turns an unknown or malformed baseline into "known empty", so later chats would classify as create and a remotely deleted chat could be recreated |
| B | Classify a missing `characters` array as `'create'` | Rejected: removes the fail-closed rule for every missing or malformed baseline and contradicts its test |
| C | On the proven fresh path only, write and adopt the server's canonical empty database `{characters: []}` | Chosen |

Why C is proven-safe: the fresh branch runs only when `loadDatabaseForStartup`
returned no bytes and no cached decode. `loadDatabaseForStartup`
(`nodeStorage.ts` ~405–450) returns `bytes: null` only for a 2xx response with
an empty body; non-2xx responses throw, and a 304 with an evicted cache body
falls back to an unconditional read. Errors from the startup load are thrown
outside the fresh branch (`bootstrap.ts` source ~51 versus the inner `try`).
On that branch the client writes the database itself and receives success,
so the server holds what the client wrote, canonicalized. With C the client
writes the shape the server would canonicalize to, and its confirmed copy
equals what the server stores.

Residuals, pre-existing and not widened by C:

- The read handler sends an empty body only when the stored value is `null`
  (installed `server.cjs` ~3981, ~435); whether the storage layer can turn a
  zero-length stored value into `null` is unresolved. The branch confirms
  server-reported absence, not installation age: an existing installation
  whose database key was removed also enters it, as today.
- The fresh write sends no `If-Match`, so two first-run clients racing could
  overwrite each other.
- Bootstrap backup recovery adopts a decoded backup directly
  (`bootstrap.ts` source ~117); a backup without `characters` could keep the
  fail-closed condition. Inferred, not demonstrated; out of scope.

## 4. Change

`patches/lazy-chat-sync/files-1.10/src/ts/bootstrap.ts` (whole-file 1.10
replacement owned by `lazy-chat-sync`), fresh branch (source ~55–59, installed
~64–68). `patches/lazy-chat-sync/anchors-1.10/src/ts/bootstrap.ts` contains the
same literal but is the pristine anchor read by the manifest; it must stay
unchanged.

```ts
// before
gotStorage = encodeRisuSaveLegacy({})
// after
// The server canonicalizes a new database to { characters: [] }
// (chatDelta.cjs canonicalizeStrippedDatabase); write that shape so the
// confirmed baseline matches the stored database exactly.
gotStorage = encodeRisuSaveLegacy({ characters: [] })
```

Nothing else changes: the decode, `setPatchSyncBaseline`, `setDatabase`, the
classifier, the fail-closed rule and the server.

## 5. Effects

- Fresh install: `lastConfirmedServerDb.characters` is `[]`; a new character's
  chat classifies as `'create'`; the 404 probe leads to a create-only write;
  the following database patch publishes the character. The same sequence was
  observed on a save that already had a `characters` array: `GET` 404, `POST
  /api/chat-content` 200, `/api/patch` 200 (`appliedOperations: 2`), no hash
  mismatch or apply error. The fresh case differs only by starting from zero
  characters; the browser test below covers it.
- `setDatabase` already sets `characters = []` when missing, so runtime
  defaults are identical.
- Patch hash: the patcher's `init` already normalizes a missing `characters`
  to `[]` on its own copy, so the client hash stays `7a5af0c2`, equal to the
  server's hash of `{characters: []}` (first patch accepted, observed).
- Server: `/api/write` receives an already-canonical database;
  `canonicalizeStrippedDatabase` returns it unchanged.
- Existing installs: the branch never runs.
- Pristine server compatibility is irrelevant (the patched client only runs
  against the patched server), but `{characters: []}` is also valid for it.

## 6. Tests

- Bootstrap boundary (`bootstrap.ts` source ~51–68; no bootstrap test exists
  today, add an owned 1.10 test):
  - fresh branch: the bytes written to `database/database.bin` decode to
    `{characters: []}` and the patch-sync baseline is `{characters: []}`;
  - a startup read error does not create or write a database;
  - a failed initial write does not install a confirmed baseline;
  - an existing database (bytes or cached decode), including `{}` and a
    malformed `characters`, is adopted unchanged — not normalized.
- Composed save (extend `files-1.10/src/ts/storage/globalApi.savePersistence.test.ts`
  ~444) starting from a confirmed baseline of exactly `{characters: []}` with a
  character created as "Create from Scratch" creates it (initial chat without
  an id):
  - the initial chat id is assigned;
  - the chat payload POST (create-only) precedes the metadata PATCH;
  - the PATCH publishes a canonical chat stub;
  - the confirmed baseline advances only after the PATCH is accepted;
  - a second chat on the same character saves afterwards as a create, and an
    edit of the first chat afterwards is an update.
- Classifier (existing `chatSaveIntent.test.ts`): keep the fail-closed
  assertion; add `{characters: []}` → unknown character's chat is `'create'`;
  add malformed `characters` and malformed `chats` cases → `'update'`.
- Browser, isolated install of the built candidate:
  - fresh install → Create from Scratch → the first chat's content is posted
    (`POST /api/chat-content` 200 with the create-only `If-None-Match: *`
    header), the database patch follows it and succeeds, no
    `ChatConflictError`, and after reload the character exists and opening the
    chat shows its payload (not only the sidebar entry);
  - repeat with a second character and chat;
  - existing save (already holding characters): unchanged behavior;
  - remote deletion guard: on an existing save, delete a chat from another
    session while the first page keeps its old confirmed baseline, then edit
    the chat in the first page; it must still report the deletion instead of
    recreating it.

A Codex plan review (Astra) found the fix sound for the fresh path and no
further save-chain blocker; it asked for the composed-save and bootstrap
boundary tests above and for the residual wording in section 3.
- Gates: patcher `npm test`; target frontend and server suites with no new
  failures against a baseline; `svelte-check --threshold error` 0 errors;
  installer apply then plan 0 changes.

## 7. Must stay unchanged

The fail-closed classification for missing or malformed baselines; remote
deletion reporting; create-collision reporting; server canonicalization and
validation; behavior for every install whose server database already exists.

## 8. Risk and flow

Risk: risky (startup persistence path; first write of a new database). Flow:
written plan, adversarial review of this document, approval, implementation
by one implementer subagent with the tests above written first and shown to
fail on the old code where applicable (the bootstrap test and the browser
fresh-install case), review, browser validation, commit; push and live apply
only after separate approval. Version bumps: `lazy-chat-sync` 0.5.9 → 0.5.10
(`manifest.cjs:67`) and its literal pins `test/lazy-chat-sync.test.cjs:28` and
`test/bg-independent-g1.test.cjs:18`; package `0.2.4-experimental.62` → `.63`;
CHANGELOG in the existing form; installer rebuilt with `npm run build`.

## 9. Out of scope

- Whether a successful full write should also normalize the confirmed copy
  (`globalApi.svelte.ts` ~1465 stores the decoded written bytes, which already
  contain `characters` after `setDatabase` defaults).
- Any change to `classifyChatSaveIntent` or `collectUnconfirmedChatPayloads`.
