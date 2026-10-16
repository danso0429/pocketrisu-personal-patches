# Usage cost and cache validation

Candidate: `0.2.4-experimental.51`; pack `usage-cost-estimate` `0.1.0`.
Current presentation candidate: `0.2.4-experimental.52`, pack `0.1.1`; see the
model-row correction below. The original receipts remain the .51 baseline.
Latest candidate: `0.2.4-experimental.53`, pack `0.1.2`; see request identity/date
below. Earlier physical confirmations remain scoped to their original changes.
Baseline: patcher `35c3270`, exact PocketRisu `1.10.0`. Date: 2026-10-16.
Contract: [usage cost plan](POCKETRISU-USAGE-COST-COLUMNS-PLAN.md).

## Result and evidence boundaries

The candidate adds period/cumulative estimates, model totals and a compact,
paginated attempt list. Each collapsed attempt shows time, model, cost, cached
tokens/ratio and savings. Disclosure retains exact counts and pricing context.
All monetary values are estimates of recorded usage, not invoice reconciliation.

| Check | Observed result | Boundary |
|---|---|---|
| Patcher tests | 333 passed | Source/catalog/resolver/installer contracts |
| Full frontend suite | 2,481 passed, 4 existing skips | Before final safe-timestamp delta |
| Full server suite | 649 passed, 12 existing skips | Before final safe-timestamp delta |
| Compatibility suite | 74 passed, 5 existing skips | Existing compatible paths |
| Final focused frontend | 80 passed | Pricing, actual collector, panel and native Gemini parser |
| Final focused server | 41 passed | Native request logs and real SQLite cost store |
| Final Svelte check | 0 errors, 0 warnings | Final source |
| Help keys | Passed | Earlier combined candidate; timestamp delta adds no keys |
| Final frontend build | Completed | Existing build warnings retained |
| Final BG bundle | Built, imported; sendChat is a function | Same candidate sources as frontend |
| Browser | Chromium 149; widths 375, 390, 1280; 28px closed rows, no horizontal overflow | Actual component, production CSS, local test font, synthetic auth/data and real SQLite/HTTP; not full Settings navigation |
| Browser interaction | 50→100 rows, model filter→1; click/Enter disclosure; no page errors | No provider call |
| Whole graph | 43 packs, 1,766 units, 522 managed paths, 9 ordered collisions | Ninth collision orders usage no-store before entries-route; not unresolved ownership |
| Fresh-source roundtrip | 1,022 baseline files restored in exact bytes/modes/links/paths; re-plan 0, disabled and empty intent | Isolated baseline, no user data |
| Installer | Two builds byte-identical; syntax valid; 8,525,916 bytes, mode 0755 | SHA-256 below |
| Live-database copy migration | Applied twice; old values unchanged in requests and usage; quick_check ok; old context NULL | Original opened read-only; only private copy migrated |

Installer SHA-256:
`f51d00813dc9ac6d7831c148c223a0a3ece1ff9a8cc23d83234b6798fddd1a6e`.

Fourteen literal published-rate fixtures independently check product, region,
tier and date boundaries. Parser tests check thinking inclusion once, service
tiers and incomplete extra tool usage. SQLite tests cover old writers/reopen,
shared filters, cursor caps/ties, unknown grouping and retained usage after body
clearing. Async tests exercise late replies, retry, unmount and duplicate clicks.

An adversarial finite legacy timestamp reproduced a Date RangeError. Final source
renders an unknown clock safely and permits paging beyond that row. No historical
row is rewritten and no arbitrary epoch threshold is introduced.

Final Opus review also identified indistinguishable older days and a cursor
asymmetry with native-admitted negative timestamps. Older rows now show MM-DD
in the same compact width (today shows HH:MM), with the full date/time in the
disclosure. Real SQLite pagination covers positive, out-of-Date-range and negative
finite timestamps. Nonfinite values cannot be sent as JSON numbers; direct internal
injection of Infinity remains outside the qualified cursor contract.

The official Developer API reference places serviceTier inside usageMetadata.
The Argon pricing section has one token rate per tier/date, without a long-context
or separate modality tier; unrelated Pro thresholds are not applied. Native jobs
persist target origin plus pathname, so recovered endpoint qualification has a path.
Express-mode Vertex URLs without locations remain explicitly unpriced.

## Runtime surfaces and exclusions

- One synthetic 10,000-row run grouped into 15 contexts: aggregate 38.21ms,
  first page 1.73ms. The timestamp index is used with temporary tie sorting.
  This is not a latency guarantee; retained-history growth remains a measurement
  surface. No destructive retention or speculative rollup was added.
- Initial prices cover exact Argon on qualified official routes. Other models,
  custom/reseller endpoints, Vertex Flex and unknown/multi-region locations are
  unpriced. Missing historical accounting stays unknown. No paid provider trial.
- Actual credits, invoice totals, tax, storage and other non-token charges remain
  unverified. Native log delivery/recovery can omit or repeat observations; the
  feature preserves native statistics and does not establish unique-charge receipts.
- Browser geometry is separate from physical iPhone font scaling, touch and PWA
  reload behavior. Physical L5 and a stable release are not completed by these checks.
- Refresh and paginated reads are separate observations. A request completed between
  the aggregate and page reads may appear before a later refresh includes it in the
  cards; this is not a transactionally frozen report. Refresh before comparing totals.
- Missing served tier is visibly marked as a Standard assumption. Request-body tier
  fallback and actual account reconciliation are not implemented. Non-boolean status
  metadata and concurrent first-time migration by multiple server processes are
  unqualified; first-party writers use booleans and delivery stops the single process.

## Delivery status

Final Opus 5.5 consultation completed against the immutable full snapshot and
the separate four-file date/cursor delta. It confirmed no blocking issue in the
delta; official pricing/API premises were independently checked by Codex. Final
focused tests, type check, build, graph roundtrip and compact browser checks were
repeated after these changes. An extra ad-hoc BG import initially checked a named
export that this bundle does not expose; the bundle's built-in global runtime load
check passed, and the corrected ad-hoc runtime check passed. No product change
was required for that test-harness mistake.

The four functional commits were pushed to main: `4c810ea` (client accounting),
`de5a0db` (storage/API), `05c98c7` (compact UI), `b25c53e` (qualified registration).
The cumulative candidate is qualified; intermediate commits introduce inert units
until registration and are not separate qualified installers.

Live delivery completed after two idle checks: owner busy chats, running models,
pending sends and active HTTP requests were all zero. The service was stopped
before preserving and verifying 426 application/state files and a private usage DB
backup. Final source hashes/modes matched the tested candidate; the matching
frontend and BG bundles were deployed together. No generation was cancelled.

Observed readback: 520 managed source files, re-plan zero; root HTTP 200; 17 served
script assets matched local bytes; both authenticated usage endpoints returned
costVersion 1 and no-store. Existing usage values remained unchanged, old context
remained NULL, and database quick_check was ok. PM2 was online with zero unstable
restarts and zero new error-log lines. Plugin host activation and configured
external-header settings were preserved. No plugin array or chat data was changed
by this delivery script. The 522 fresh-apply changed paths include state/intent;
they are distinct from the 520 managed source files.

BG bundle SHA-256:
`e026fdcc66ab1086fdcf2ceb776300b8fbdf32ab2d25219aecfee7c34b7cd30b`.

Source rollback can restore the previous app/state while leaving the additive
nullable column and current usage intact. The verified stopped DB backup is an
emergency recovery point; do not overwrite resumed-service data blindly with it.
Current and previous application recovery points are retained. No backup cleanup
was performed as part of this delivery.

The outgoing 22-path source/artifact sweep found no sensitive-pattern hits.
GitHub CI for `b25c53e` completed successfully. At .51 delivery physical iPhone
L5 remained pending; see the scoped .52 confirmation below. No stable tag or
release was created.

## Physical L5 preparation

Refresh the app to adopt the new build, then open Settings → System → Usage.
No extra paid request is required just to inspect existing history.

| UI | Change | Gesture and expected result |
|---|---|---|
| Individual attempt list | One compact line per attempt | Scroll on a narrow iPhone; time/date, model, cost and cache/savings columns remain on one line without page-wide horizontal scrolling. Tap a row to expand exact counts/full date/model; tap again to collapse. |
| Period/model/source filters | Shared filtered totals and pages | Change each filter; cards, model totals and list follow it. Cumulative keeps model/source but drops dates. Refresh before comparing concurrent arrivals. |
| Historical/unsupported entries | Explicit unknown cost | Existing rows without metadata show unknown/unpriced, with recorded positive tokens retained. They must not appear as confirmed free requests. |
| Priced new usage, when ordinary use provides it | Cost and cache savings | On a supported official Argon request, compare collapsed values with expanded exact tokens; assumed tier is marked. No separate paid trial is required by this checklist. |

Unexpected results include clipped numbers, tap not opening details, old-filter
rows returning after a new selection, or missing metadata presented as known zero.

## Experimental.52 — model-row correction

Physical screenshot feedback rejected the model section's tall cards. The .51
browser qualification measured compact attempt rows, not compact model totals.
This correction also gives model totals a one-line 11px summary: model, request
count, estimated cost, cached tokens/ratio and savings. Full model/provider,
exact counts, unknown/exclusion reasons, assumption and duration remain inside
the native disclosure. Pricing, persistence, filters, async ownership and attempt
rows are unchanged. Top period/cumulative cards are outside this screenshot fix.

Observed checks: 35 existing UI/pricing tests passed, patcher 333 passed,
Svelte 0 errors/0 warnings and production build completed. Final Chromium with
production CSS and synthetic SQLite/API measured model rows at 28px across
375/390/1280px, no horizontal overflow, and verified click/Enter disclosure plus
existing attempt pagination/filtering. An initial browser assertion incorrectly
expected one request's input count in an aggregate row; it was corrected to the
120-request aggregate without changing product code or weakening assertions.
Whole graph and exact 1,022-file roundtrip passed again, with re-plan zero.

Installer: 8,527,884 bytes, mode 0755, two builds identical, SHA-256
`e61131ebd006a6a1abc17504b137845e6ea754d4024ce583842d9104e51f322e`.
The live read-only plan changes only UsageCostPanel.svelte and patcher state.
This UI-only correction does not migrate or copy a database; the existing verified
schema recovery point remains available. The earlier screenshot is failure feedback;
the later normal-use confirmation below closes this correction's scoped L5.

Opus identified a Korean compact-unit width risk. Browser measurements reproduced
81px text in the former 74px cache column; the model cache column is now 5.3rem
and the request header clips within its own column in English. Final measurements
at 375/390px keep the four Korean cache strings within the 85px column. Model aria labels
also retain savings and assumed-tier information. Large monetary totals and long
model/provider identities can still require disclosure for full text; exact values
remain available there rather than forcing a wide page.
Final Opus 5.5 follow-up found no new concrete issue in those three adjustments;
the 35 tests, type check, production build and browser checks passed after them.

Delivered source commit `1c7682d`. Two pre-stop activity checks were idle across
owner chats, models, pending sends and HTTP requests. Verified 415 app/state backup
files, applied the UI/state-only plan and deployed the matching frontend build.
Readback: 520 managed source files match the tested candidate, re-plan zero,
root HTTP 200, 17 served script assets match local bytes, both cost API responses
are version 1/no-store. Existing usage including cost metadata is unchanged and
quick_check is ok. BG bundle, plugin-host activation and header settings are
unchanged. PM2 is online, unstable restarts zero, new error lines zero. No model
call, database migration/copy or usage-data edit was performed.

### Scoped L5 and documentation closeout — 2026-10-16

After .52 was deployed and the user was asked to refresh Usage → By model,
check the single-line layout and tap to expand/collapse, the user replied
“정상”. This closes the model-row correction's physical UI L5. It does not
assert completion of the other period/filter/new-priced-usage scenarios above,
physical VoiceOver/text-scaling variants or broader BG/release qualification.

GitHub implementation run `38851071687` (`1c7682d`) and delivery-document run
`38851214599` (`0f6169a`) both completed successfully. The earlier .51
document run `38849494221` also succeeded. Scoped L6 updates README, changelog,
this record and the shared journal, and removes the completed temporary model-row
L3 report. The broader usage audit remains available for its unfinished scope.
Runtime, package version, installer bytes and live delivery are unchanged by
this documentation closeout. Stable remains `v0.2.3`; no tag/release is created.

## Experimental.53 — request identity and full date

The user reported missing fields in individual attempts and requested no check
beside the timestamp plus a YYMMDD date. Read-only metadata observations confirmed
persisted missing models with positive usage, including recovered-job entries with
new accounting metadata. This was not solely a CSS rendering defect.

The client request path and jobFetch already send the resolved model. Native
POST /api/model-jobs omitted req.body.model when constructing createJob's argument,
while createJob already persists arg.model and recovery logging reads job.model.
The correction forwards that field only; it adds no column or historical update.
The recovery path does not record the provider identity. It remains explicitly
unrecorded rather than being guessed from current settings or adapter names.

The native HTTP/local-upstream/SQLite/job-GET test was strengthened to submit and
assert the model. Before the route fix it failed exactly on the missing model
(one failed, 21 passed); after the fix the full server suite passed, including
that assertion and the original upstream bytes, headers, journal and job guards.

UI changes label null/empty/whitespace models as unrecorded, retain recorded token
counts and unknown-cost evidence, and explain missing-model pricing exclusion.
Every valid clock uses local YYMMDD HH:MM. Inline success/abort/failure glyphs are
removed while state remains in aria labels and disclosure. The attempt summary
uses 10px text and adjusted columns; model-total rows retain their .52 layout.

| Check | Observed result |
|---|---|
| Focused client | 118 passed: pricing, cost collector/panel, jobFetch, recovery and native log collector |
| Full server | 650 passed, 12 existing skips; actual HTTP/SQLite model readback included |
| Patcher | 333 passed |
| Svelte/help/build/BG | 0 errors/0 warnings, help keys passed, frontend build and BG built-in runtime load passed |
| Real Chromium 149 | 375/390/1280px, 28px attempt rows, no horizontal overflow, model column at least 64px, full date fits its column |
| Browser behavior | Missing-identity hints, no status glyphs, YYMMDD HH:MM, click/Enter disclosure, 50→100 pages, model filter→1, page errors 0 |
| Full graph | 43 packs/1,769 units/523 changed paths/9 ordered collisions; re-plan zero |
| Exact revert | All 1,022 baseline files match bytes/modes/links/paths; disabled and empty intent |
| Installer | 8,531,097 bytes/0755; two builds identical; syntax valid |

Installer SHA-256:
`540eea44f66a15de7669d241f46ed362368dd7321fcb8eff908ceb6ac85ec104`.

Opus consultation failed before review because its session quota was exhausted.
No substitute model or repeated quota retry was used; no Opus approval is claimed.
The scope was verified directly through the failing/passing native route test,
unchanged assertions, full server and focused client checks, graph and browser.

The initial generated patch wrapper was rejected due to a trailing-comma parse
and unsupported numbered hunk syntax; the wrapper was corrected without changing
product behavior to suit a fixture. No such failed patch was applied to live.

Historical missing metadata is not backfilled or deleted. This fixes the known
model-loss boundary for new jobs and makes old absence explicit; it does not
promise to recover absent historical identity or infer unsupported prices.
Direct billing, multi-process bootstrap and inherited observational log loss/
duplication limits remain unchanged. Physical L5, final CI and live readback are
recorded separately after observation. No stable tag or release is created.
