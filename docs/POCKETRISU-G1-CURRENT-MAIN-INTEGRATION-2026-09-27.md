# PocketRisu 1.10 BG-independent G1 on current patcher main

Date: 2026-09-27 KST

Status: live-applied candidate with automated and HTTP checks. G1 is not
complete; real-browser/iPhone qualification, paid-provider test, tag and
release remain open.

## Source and ownership

- Base patcher: `d2bca03`, package `0.2.4-experimental.4`. This integration
  uses the current target-only 1.10 catalog and single-installer engine, with
  package candidate `0.2.4-experimental.5`.
- G1 source was carried from `codex/pocketrisu-bg-independent` through
  `a7e7a2e`: operation-keyed browser effects, shared draft identity, atomic
  normal-chat commit, N+1 input, bounded payload retirement with exact
  permanent identity receipts, blocked-draft explicit retry and guarded
  client capability 1. Archive Center source is unchanged and not required.
- Three pack versions change relative to read-only live state:
  `lazy-chat-bg-adapter` 0.2.1 → 0.7.12, `lazy-chat-sync` 0.3.2 → 0.5.2,
  `personal-settings` 0.5.10 → 0.5.11. The newer appearance editor is retained;
  its strict root-only save is tested with G1's browser-effect identity.
- The original G1 candidate and this current-engine composition had 413/413
  managed product paths with matching output SHA-256 and POSIX modes. The
  engine/catalog differ, but this comparison found no generated product-file
  difference. The older two-file installer alias is not reintroduced here.

## Observed automatic validation

| Gate | Result on exact official PocketRisu 1.10.0 `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` |
| --- | --- |
| Patcher | 51/51 tests; generated single installer 5,330,374 bytes, SHA-256 `209e29118b8e99fed8bee7bd80bf4c3074c5a09a2eb2995bca251d4431ffb280`, two consecutive builds identical |
| Full graph | 42 effective packs, 1,117 ordered units, 7 declared collisions; 415 changed paths including state/intent; status current, re-plan 0; exact revert clean/disabled with tracked diff 0 |
| Target server | 350 passed, 12 skipped; spawned process/SQLite/normal chat HTTP and failure injection included |
| Target frontend | 1,910 passed, 2 skipped; shared draft, pending UI, save/rebase and newer appearance tests included |
| Target type/build | 0 errors, 0 warnings; production build passed; BG bundle built and loaded `sendChat` |
| Live baseline (read-only) | 370 managed paths matched installed hashes and modes, mismatch 0; installed pack versions above |

The automatic validation above did not change live PocketRisu, user data,
provider or AC runtime. A separate controlled live application is recorded
below. The previous branch's detailed owner/audit evidence remains in its
`docs/POCKETRISU-1.10-BG-INDEPENDENT-G1-RUNTIME-AUDIT-2026-09-27.md`;
the exact generated-product parity is the bridge to this current-engine tree.

## Supported path and open gates

- Candidate input-v1 early admission supports ordinary classic cloud-model
  sends without browser-only generation epilogues. Browser-local
  proxy/custom/plugin models, preset/module bindings and media/TTS epilogues
  stay on the prior client-prepared path. This is a routing/safety boundary,
  not a claim that every dynamic provider URL was exercised.
- Before live delivery, recheck exact source/installer hash, live managed-file
  drift, active and durable generation state, current installed versions,
  available recovery copy and normal patcher plan. Never cancel active work,
  discard user data or change AC to make the test pass.
- After safe application, the actual browser must submit N, fully exit, and
  leave the server to commit. Read the normal chat API **before** reopening;
  then verify the answer, revision, variables/statistics once, empty-local
  adoption, two-tab same-draft behavior, blocked-edit retry and old cached
  client fence on iPhone. Paid-provider calls require a user decision.
- A source rollback is not automatically a data rollback. New normal-chat
  content and effect receipts may have been written after activation; preserve
  and inspect them before any rollback, and do not remove user-created
  conflict copies or recovery records as cleanup.

## Controlled live application (2026-09-27 KST)

The exact installer above was applied to the existing PocketRisu 1.10 live
tree after a fresh read-only preflight. All 370 prior managed files matched
their installed hashes and modes. The prior BG states were 52 delivered,
zero result rows; model jobs were 48 done, 2 aborted, zero running, and
pending sends were zero. The patcher plan reported verified compatibility,
42 packs, 7 declared collisions and 58 changed paths, with no AC path.

Before stopping the process, a private recovery directory was created at
`backups/pocketrisu-g1-prelive-20260927-105146` in the live tree (directory
mode 0700, files 0600). It contains consistent SQLite backups of `risuai.db`
and `model-jobs.db`, prior patcher state/intent, and a source archive excluding
`save`, `backups`, `node_modules` and `dist`. Both backed-up databases returned
`quick_check=ok`; the source archive listed 1,427 entries successfully. The
recovery copy has not been used, removed or published.

After the zero-active-work recheck, PM2 was stopped before applying. The
installer changed the planned 58 paths. The first BG bundle build could not
resolve `svelte` because the live `node_modules` lacked dev-dependency links;
`pnpm install --frozen-lockfile --offline` restored 109 cached packages without
changing the package manifest or lockfile. The subsequent BG bundle build
loaded `sendChat`; the frontend build completed with 8,005 transformed modules.
The post-apply patcher status was `current` for 413/413 managed files, all
42 catalog pack versions were current, and a second plan had zero changes.

PM2 restarted with zero unstable restarts. The live HTTP root returned 200;
its HTML referenced `/assets/index-Cs1RITL4.js`, and the served file matched
the local SHA-256
`f9ae80891afab536ad596548843b2295309878c49f139802257d982d439ddd18`.
The authenticated capability endpoint returned HTTP 200 and
`inputCommandVersion=1`, `inputCommandFoundationVersion=4`,
`serverChatCommitVersion=1`, `chatExecutionProjectionVersion=1`. Live DB
`quick_check=ok`; the PM2 error log remained at 228 bytes. A subsequent
retention check found 47 delivered BG state rows: the five removed rows were
all delivered in the pre-apply backup, with no newly added row or outstanding
result. No provider call or browser test was performed during these checks.

The planned normal-chat API read-before-browser-reopen requires an authorized
JWT for `/api/chat-content`. An initial attempt to prepare a temporary JWT
directly from the live server secret was rejected by runtime security review
and was not executed or bypassed. The user then explicitly authorized a
memory-only, short-lived token for read-only normal-chat GETs. Under that
approval, a missing-chat probe returned 404 and an actual chat GET returned
200 with a revision header. No key, token, chat ID or content was printed or
persisted by these probes.

### First iPhone send: non-qualifying provider path

One iPhone send was observed after activation. The request log gained one
successful direct streaming request, and one Gemini model job reached `done`
with 22,138 result bytes but remained unclaimed. A pending-send record
remained. No new G1 operation state, input command or commit record appeared.
The normal chat API returned 55 messages, the same count reported at the
server's pre-generation chat-context read, ending in a user message rather
than a committed assistant answer. This is not evidence that the answer was
lost: the completed model-job result was still retained for client return.

Read-only settings inspection found preset model mode, module model bindings
enabled and plugin-model IDs. Each is an explicit reason to retain the older
client-prepared path instead of input-v1 early admission. This attempt
therefore does not qualify or refute the G1 server-owned input path. Whether
the PWA was fully exited before completion awaits device confirmation; the
observed result adoption is recorded below. A qualifying classic
cloud-model test would require a deliberate settings change or an isolated
test environment; the live user's settings were not altered. G1 browser
exit/read-before-reopen, answer adoption, effects-once and paid-call gates
remain open.

### First iPhone return: answer recovered, metadata incomplete

On client return, the same model job became `claimed=1` and the pending-send
row cleared. The normal chat API returned 56 messages, with the restored
assistant answer at zero-based index 55. The answer was therefore saved after
client return; it was not present in the earlier normal-chat read. No input-v1
record or G1 server commit appeared, so this is a successful return through
the older model-job recovery path, not a G1 server-owned completion.

The restored answer's `generationInfo` contained its generation ID but no
defined model or input/output/context token values. The UI consequently showed
`Model: Unknown` and `?` for those token fields. Its separate `Tokens` value
is a local tokenization of the answer text, not recovered provider usage.
Earlier assistant messages in the same chat have the fuller metadata fields.

The model-job recovery code derives `generationInfo.model` from the persisted
job model and does not add input/output/context token fields. The new job's
persisted model was null; all 50 existing Google-Gemini main job rows in this
live DB also have a null model. Hash comparison against the pre-apply source
archive found `jobRecovery.ts`, `jobFetch.ts`, `request.ts`, `model-jobs.cjs`
and `bgStreamPreserve.svelte.ts` unchanged by this G1 application. Thus the
observed metadata gap is in the existing recovery path, although the exact
reason the browser omitted the model at job creation is not yet proven; a
cached client bundle remains a possible factor. The user's complete-PWA-exit
timing has not been confirmed, and this return does not qualify the G1
read-before-reopen/server-commit gate.
